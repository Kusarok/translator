import crypto from "node:crypto";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";
import { getSpotifyAccount, importSpotifyPlaylistCache, saveSpotifyAccount } from "./media-worker.service.js";
import { appKey } from "./app-secret.js";

const authorizeUrl = "https://accounts.spotify.com/authorize";
const tokenUrl = "https://accounts.spotify.com/api/token";
const scopes = "playlist-read-private";
const legacyKey = () => crypto.createHash("sha256").update(`${env.ownerPassword}:${env.spotifyClientSecret}`).digest();
const key = () => appKey("spotify-tokens");

const seal = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
};

const open = (value) => {
  const parts = String(value || "").split(".").map((part) => Buffer.from(part, "base64url"));
  for (const candidate of [key(), legacyKey()]) {
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", candidate, parts[0]);
      decipher.setAuthTag(parts[1]);
      return Buffer.concat([decipher.update(parts[2]), decipher.final()]).toString("utf8");
    } catch { /* Existing tokens may still use the legacy deployment key. */ }
  }
  throw new HttpError(401, "Reconnect Spotify to refresh your secure session.");
};

const signedState = (userId) => {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 10 * 60 * 1000, nonce: crypto.randomUUID(), userId })).toString("base64url");
  const signature = crypto.createHmac("sha256", appKey("spotify-state")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
};

const verifyState = (state) => {
  const [payload, signature] = String(state || "").split(".");
  if (!payload || !signature) return false;
  const expected = crypto.createHmac("sha256", appKey("spotify-state")).update(payload).digest("base64url");
  const legacy = crypto.createHmac("sha256", env.ownerPassword).update(payload).digest("base64url");
  const matches = (candidate) => signature.length === candidate.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(candidate));
  if (!matches(expected) && !matches(legacy)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    return decoded.exp > Date.now() ? decoded : null;
  } catch { return null; }
};

const ensureConfigured = () => {
  if (!env.spotifyClientId || !env.spotifyClientSecret || !env.spotifyRedirectUri) {
    throw new HttpError(503, "Configure SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET and SPOTIFY_REDIRECT_URI first.");
  }
};

const tokenRequest = async (body) => {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${env.spotifyClientId}:${env.spotifyClientSecret}`).toString("base64")}` },
    body: new URLSearchParams(body), signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(502, data.error_description || data.error || "Spotify authorization failed.");
  return data;
};

const spotifyJson = async (url, accessToken) => {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(response.status, data.error?.message || "Spotify request failed.");
  return data;
};

const saveTokens = async ({ userId, profile, tokens, oldRefreshToken = "" }) => saveSpotifyAccount(userId, {
  spotifyUserId: profile.id,
  displayName: profile.display_name || "Spotify",
  accessTokenCiphertext: seal(tokens.access_token),
  refreshTokenCiphertext: seal(tokens.refresh_token || oldRefreshToken),
  scopes: tokens.scope || scopes,
  expiresAt: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString()
});

export const spotifyConnectUrl = (userId) => {
  ensureConfigured();
  return `${authorizeUrl}?${new URLSearchParams({ client_id: env.spotifyClientId, response_type: "code", redirect_uri: env.spotifyRedirectUri, scope: scopes, state: signedState(userId) })}`;
};

export const completeSpotifyConnection = async ({ userId, code, state }) => {
  ensureConfigured();
  const decoded = verifyState(state);
  if (!decoded || decoded.userId !== userId || !code) throw new HttpError(400, "Invalid or expired Spotify connection state.");
  const tokens = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: env.spotifyRedirectUri });
  const profile = await spotifyJson("https://api.spotify.com/v1/me", tokens.access_token);
  await saveTokens({ userId, profile, tokens });
};

const activeAccess = async (userId) => {
  ensureConfigured();
  const result = await getSpotifyAccount(userId);
  const account = result.data;
  let accessToken = open(account.access_token_ciphertext);
  if (Date.parse(account.expires_at) <= Date.now() + 60_000) {
    const refreshToken = open(account.refresh_token_ciphertext);
    const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
    await saveTokens({ userId, profile: { id: account.spotify_user_id, display_name: account.display_name }, tokens, oldRefreshToken: refreshToken });
    accessToken = tokens.access_token;
  }
  return accessToken;
};

export const importConnectedSpotifyPlaylist = async (userId, playlistUrl) => {
  const id = String(playlistUrl || "").match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/([A-Za-z0-9]{22})/i)?.[1];
  if (!id) throw new HttpError(400, "A valid Spotify playlist link is required.");
  const accessToken = await activeAccess(userId);
  const playlist = await spotifyJson(`https://api.spotify.com/v1/playlists/${id}`, accessToken);
  const tracks = [];
  let next = `https://api.spotify.com/v1/playlists/${id}/items?limit=50`;
  while (next) {
    const page = await spotifyJson(next, accessToken);
    for (const item of page.items || []) {
      const track = item.track;
      if (!track?.id || track.type !== "track") continue;
      tracks.push({ spotifyId: track.id, sourceUrl: track.external_urls?.spotify,
        title: track.name, artist: (track.artists || []).map((artist) => artist.name).join(", "),
        album: track.album?.name || "", duration: Number(track.duration_ms || 0) / 1000,
        artwork: track.album?.images?.[0]?.url || "", position: tracks.length });
    }
    next = page.next;
  }
  const payload = { spotifyId: playlist.id, name: playlist.name, description: playlist.description || "",
    sourceUrl: playlist.external_urls?.spotify, artwork: playlist.images?.[0]?.url || "",
    snapshotId: playlist.snapshot_id, tracks };
  return (await importSpotifyPlaylistCache(userId, payload)).data;
};
