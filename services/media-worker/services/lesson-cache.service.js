import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { createId } from "../database/index.js";
import { repositories } from "../persistence.js";

const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const spotifyId = (value) => String(value || "").match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})/i)?.[1] || "";
const relative = (absolute) => path.relative(config.dataDir, absolute).split(path.sep).join("/");

const writeJson = (directory, filename, value) => {
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, filename);
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
  return relative(target);
};

const cacheArtwork = async (track, remoteUrl) => {
  if (!remoteUrl || repositories.artwork.findForTrack(track.id)) return;
  try {
    const response = await fetch(remoteUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) return;
    const mimeType = response.headers.get("content-type")?.split(";", 1)[0] || "image/jpeg";
    if (!mimeType.startsWith("image/")) return;
    const extension = ({ "image/png": ".png", "image/webp": ".webp", "image/avif": ".avif" })[mimeType] || ".jpg";
    const id = createId("artwork");
    const directory = path.join(config.artworkDir, id);
    fs.mkdirSync(directory, { recursive: true });
    const target = path.join(directory, `cover${extension}`);
    fs.writeFileSync(target, bytes);
    repositories.artwork.upsert({ id, trackId: track.id, remoteUrl, relativePath: relative(target), mimeType,
      sizeBytes: bytes.length, checksum: crypto.createHash("sha256").update(bytes).digest("hex") });
  } catch { /* Artwork is optional and can be populated on a later cache hit. */ }
};

const readJson = (relativePath) => {
  const target = path.resolve(config.dataDir, relativePath);
  const root = `${path.resolve(config.dataDir)}${path.sep}`;
  if (!target.startsWith(root)) return null;
  try { return JSON.parse(fs.readFileSync(target, "utf8")); } catch { return null; }
};

export const cacheTrackLyrics = async (payload) => {
  if (!payload?.spotifyId || !Array.isArray(payload.lines)) throw new TypeError("spotifyId and lines are required");
  const track = repositories.tracks.upsert({
    source: "spotify", externalId: payload.spotifyId, sourceUrl: payload.sourceUrl,
    title: payload.title, artist: payload.artist, album: payload.album,
    durationSeconds: payload.duration, artworkUrl: payload.artwork
  });
  writeJson(path.join(config.tracksDir, track.id), "metadata.json", { ...payload, lines: undefined, trackId: track.id });
  await cacheArtwork(track, payload.artwork);

  const contentHash = hash(payload.lines);
  let lyrics = repositories.lyrics.findForTrack(track.id).find((item) => item.content_hash === contentHash);
  if (!lyrics) {
    const id = createId("lyrics");
    const relativePath = writeJson(path.join(config.lyricsDir, id), "original.json", payload.lines);
    lyrics = repositories.lyrics.upsert({ id, trackId: track.id, source: "lrclib", externalId: payload.lrclibId,
      language: "original", contentHash, relativePath });
  }
  return { trackId: track.id, lyricsId: lyrics.id };
};

export const cacheTranslation = (payload) => {
  const track = repositories.tracks.findByExternalId("spotify", payload.spotifyId);
  const lyrics = track && repositories.lyrics.findForTrack(track.id)[0];
  if (!lyrics || !Array.isArray(payload.translations)) throw new TypeError("Cached lyrics and translations are required");
  const provider = payload.provider || "shared";
  const model = payload.model || "unknown";
  const promptVersion = payload.promptVersion || "lyrics-v1";
  const existing = repositories.translations.findCached({ lyricsId: lyrics.id, targetLanguage: payload.targetLanguage || "fa", provider, model, promptVersion });
  const id = existing?.id || createId("translation");
  const relativePath = writeJson(path.join(config.translationsDir, id), `${payload.targetLanguage || "fa"}.json`, payload.translations);
  return repositories.translations.upsert({ id, lyricsId: lyrics.id, targetLanguage: payload.targetLanguage || "fa",
    provider, model, promptVersion, contentHash: hash(payload.translations), relativePath });
};

export const getCachedLesson = (externalId) => {
  const track = repositories.tracks.findByExternalId("spotify", externalId);
  if (!track) return null;
  const lyrics = repositories.lyrics.findForTrack(track.id)[0];
  if (!lyrics) return null;
  const lines = readJson(lyrics.relative_path);
  if (!Array.isArray(lines)) return null;
  const translation = repositories.translations.findLatest(lyrics.id, "fa");
  const translations = translation ? readJson(translation.relative_path) : null;
  const media = repositories.media.findReadyForTrack(track.id);
  const artwork = repositories.artwork.findForTrack(track.id);
  const mediaExists = media && fs.existsSync(path.resolve(config.dataDir, media.relative_path));
  return {
    spotifyId: track.external_id, sourceUrl: track.source_url, title: track.title, artist: track.artist,
    album: track.album, duration: track.duration_seconds, artwork: artwork ? `/api/media/artwork/${artwork.id}` : track.artwork_url,
    lrclibId: lyrics.external_id, trackId: track.id, lyricsId: lyrics.id,
    lines: lines.map((line, index) => ({ ...line, translation: Array.isArray(translations) ? translations[index] || "" : "" })),
    translationCached: Array.isArray(translations),
    mediaId: mediaExists ? media.id : null,
    streamUrl: mediaExists ? `/api/media/${media.id}/stream` : null,
    downloadUrl: mediaExists ? `/api/media/${media.id}/download` : null,
    media: mediaExists ? { id: media.id, streamUrl: `/api/media/${media.id}/stream`, downloadUrl: `/api/media/${media.id}/download` } : null
  };
};

export const findTrackForReference = (referenceUrl) => {
  const id = spotifyId(referenceUrl);
  return id ? repositories.tracks.findByExternalId("spotify", id) : null;
};
