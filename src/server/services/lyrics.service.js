import { HttpError } from "../utils/http-error.js";
import { translateText } from "./translation.service.js";
import { cacheLessonTranslation, cacheTrackLyrics, getCachedLesson, getCachedLessonByTrackId } from "./media-worker.service.js";

const SPOTIFY_TRACK = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})(?:[/?#]|$)/i;
const LYRICS_BATCH_MAX_LINES = 20;
const LYRICS_BATCH_MAX_CHARS = 900;
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
  try {
    const cached = await getCachedLesson(match[1]);
    if (cached?.data?.lines?.length) return { ...cached.data, cacheHit: true };
  } catch (error) {
    if (error.status !== 404) console.warn("Lesson cache lookup failed:", error.message);
  }
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
  const result = {
    spotifyId: match[1], sourceUrl, title: best.record.trackName, artist: best.record.artistName,
    album: best.record.albumName, duration: Number(best.record.duration), artwork: metadata.artwork,
    lrclibId: best.record.id, lines
  };
  let cacheIds = {};
  try { cacheIds = (await cacheTrackLyrics(result)).data || {}; } catch (error) { console.warn("Could not cache lyrics:", error.message); }
  return { ...result, ...cacheIds, cacheHit: false };
};

export const createLyricsBatches = (lines, maxLines = LYRICS_BATCH_MAX_LINES, maxChars = LYRICS_BATCH_MAX_CHARS) => {
  const batches = [];
  let batch = [];
  let characters = 0;
  for (const line of lines) {
    const nextCharacters = characters + line.text.length + (batch.length ? 1 : 0);
    if (batch.length && (batch.length >= maxLines || nextCharacters > maxChars)) {
      batches.push(batch);
      batch = [];
      characters = 0;
    }
    batch.push(line);
    characters += line.text.length + (batch.length > 1 ? 1 : 0);
  }
  if (batch.length) batches.push(batch);
  return batches;
};

const translatedLines = (text) => String(text || "")
  .replace(/^```[^\n]*\n?/i, "")
  .replace(/\n?```$/i, "")
  .split(/\r?\n/)
  .map((line) => line.trim());

export const translateLyricsBatch = async (batch, options, translate = translateText) => {
  const result = await translate({
    text: batch.map((line) => line.text).join("\n"),
    sourceLanguage: "auto",
    targetLanguage: "fa",
    mode: "audio",
    ...options
  });
  const output = translatedLines(result.text);
  if (output.length === batch.length && output.every(Boolean)) {
    return { values: output, model: result.model };
  }
  if (batch.length === 1) {
    const value = clean(output.filter(Boolean).join(" "));
    if (!value) throw new HttpError(502, "The model returned an empty lyrics translation");
    return { values: [value], model: result.model };
  }
  const middle = Math.ceil(batch.length / 2);
  const left = await translateLyricsBatch(batch.slice(0, middle), options, translate);
  const right = await translateLyricsBatch(batch.slice(middle), options, translate);
  return { values: [...left.values, ...right.values], model: right.model || left.model || result.model };
};

export const translateLyrics = async ({ spotifyId, trackId, lines, provider, apiKey, model, authenticated }) => {
  if (!Array.isArray(lines) || !lines.length || lines.length > 500) throw new HttpError(400, "Lyrics lines are required");
  if (trackId || spotifyId) {
    try {
      const cached = trackId ? await getCachedLessonByTrackId(trackId) : await getCachedLesson(spotifyId);
      if (cached?.data?.translationCached) {
        return { translations: cached.data.lines.map((line) => line.translation || ""), model: "cached", cacheHit: true };
      }
    } catch (error) {
      if (error.status !== 404) console.warn("Translation cache lookup failed:", error.message);
    }
  }
  const populated = lines.map((line, index) => ({ text: clean(line), index })).filter((line) => line.text);
  if (!populated.length) return { translations: lines.map(() => ""), model: null };
  const translations = lines.map(() => "");
  let translatedModel = null;
  for (const batch of createLyricsBatches(populated)) {
    const translated = await translateLyricsBatch(batch, { provider, apiKey, model, authenticated });
    translatedModel = translated.model || translatedModel;
    batch.forEach((line, index) => { translations[line.index] = translated.values[index]; });
  }
  if (trackId || spotifyId) {
    try {
      await cacheLessonTranslation({ trackId, spotifyId, translations, targetLanguage: "fa", provider: provider || (authenticated ? "owner" : "free"), model: translatedModel, promptVersion: "lyrics-v2-chunked" });
    } catch (error) { console.warn("Could not cache translation:", error.message); }
  }
  return { translations, model: translatedModel, cacheHit: false };
};
