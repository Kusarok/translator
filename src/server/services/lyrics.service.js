import { HttpError } from "../utils/http-error.js";
import { translateText } from "./translation.service.js";

const SPOTIFY_TRACK = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})(?:[/?#]|$)/i;
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const norm = (value) => clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(response.status === 404 ? 404 : 502, data.message || "Lyrics service is unavailable");
  return data;
};

export const parseLrc = (value) => String(value || "").split(/\r?\n/).flatMap((row) => {
  const timestamps = [...row.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g)];
  if (!timestamps.length) return [];
  const text = clean(row.replace(/\[[^\]]+\]/g, ""));
  return timestamps.map((match) => ({ time: Number(match[1]) * 60 + Number(match[2]), text }));
}).sort((a, b) => a.time - b.time);

const spotifyMetadata = async (sourceUrl) => {
  const oembed = await fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(sourceUrl)}`, {
    headers: { "User-Agent": "Translator/1.0" }
  });
  const page = await fetch(sourceUrl, { headers: { "User-Agent": "Mozilla/5.0 Translator/1.0" }, signal: AbortSignal.timeout(15000) }).then((r) => r.text());
  const meta = (property) => {
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return clean(page.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)`, "i"))?.[1] ||
      page.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"))?.[1]);
  };
  const title = meta("og:title") || clean(oembed.title).replace(/\s*[|·-]\s*Spotify\s*$/i, "");
  const description = meta("og:description");
  const descriptionParts = description.split(/[·•]/).map(clean);
  const musicianMeta = meta("music:musician");
  const albumMeta = meta("music:album");
  const artist = (!/^https?:/i.test(musicianMeta) && musicianMeta) || descriptionParts[0]?.replace(/^.*? by /i, "") || "";
  const album = (!/^https?:/i.test(albumMeta) && albumMeta) || descriptionParts[1] || "";
  const duration = Math.round(Number(meta("music:duration")) || 0);
  return { title, artist, album, duration, artwork: oembed.thumbnail_url || "" };
};

const score = (record, metadata) => {
  let value = norm(record.trackName) === norm(metadata.title) ? 50 : 0;
  if (metadata.artist && (norm(record.artistName) === norm(metadata.artist) || norm(record.artistName).includes(norm(metadata.artist)))) value += 35;
  if (metadata.album && norm(record.albumName) === norm(metadata.album)) value += 10;
  if (metadata.duration && Math.abs(Number(record.duration) - metadata.duration) <= 2) value += 20;
  return value;
};

export const findSpotifyLyrics = async (input) => {
  const sourceUrl = clean(input).split(/[?#]/)[0];
  const match = sourceUrl.match(SPOTIFY_TRACK);
  if (!match) throw new HttpError(400, "Only Spotify track links are supported");
  const metadata = await spotifyMetadata(sourceUrl);
  if (!metadata.title) throw new HttpError(422, "Could not read this Spotify track's metadata");

  const query = new URLSearchParams({ track_name: metadata.title });
  if (metadata.artist) query.set("artist_name", metadata.artist);
  const records = await fetchJson(`https://lrclib.net/api/search?${query}`, { headers: { "User-Agent": "Translator/1.0 (lyrics learning)" } });
  const ranked = (Array.isArray(records) ? records : []).map((record) => ({ record, score: score(record, metadata) })).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const minimumScore = metadata.artist ? 85 : 50;
  if (!best || best.score < minimumScore || !best.record.syncedLyrics) throw new HttpError(404, "No synchronized lyrics matching this exact Spotify track were found");
  const lines = parseLrc(best.record.syncedLyrics);
  if (!lines.some((line) => line.text)) throw new HttpError(404, "Synchronized lyrics are unavailable for this track");
  return {
    spotifyId: match[1], sourceUrl, title: best.record.trackName, artist: best.record.artistName,
    album: best.record.albumName, duration: Number(best.record.duration), artwork: metadata.artwork,
    lrclibId: best.record.id, lines
  };
};

export const translateLyrics = async ({ lines, provider, apiKey, model, authenticated }) => {
  if (!Array.isArray(lines) || !lines.length || lines.length > 500) throw new HttpError(400, "Lyrics lines are required");
  const populated = lines.map((line, index) => ({ text: clean(line), index })).filter((line) => line.text);
  if (!populated.length) return { translations: lines.map(() => ""), model: null };
  const source = populated.map((line) => line.text).join("\n");
  const result = await translateText({ text: source, sourceLanguage: "auto", targetLanguage: "fa", mode: "audio", provider, apiKey, model, authenticated });
  const translated = String(result.text || "").split(/\r?\n/);
  if (translated.length !== populated.length) throw new HttpError(502, `Translation returned ${translated.length} lines instead of ${populated.length}; timestamps were not changed`);
  const translations = lines.map(() => "");
  populated.forEach((line, index) => { translations[line.index] = translated[index]; });
  return { translations, model: result.model };
};
