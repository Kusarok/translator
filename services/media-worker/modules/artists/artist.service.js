import crypto from "node:crypto";
import { inspectSearchResult } from "../../downloader.js";
import { repositories } from "../../persistence.js";
import { cacheTrackLyrics, getCachedLessonByTrackId } from "../../services/lesson-cache.service.js";
import { normalizeSearchText } from "../search/query-normalizer.js";
import { rankCandidate } from "../search/result-ranker.js";
import { browseArtistRecordings, searchMusicBrainzArtists } from "./musicbrainz.provider.js";

const scanQueue = [];
const queued = new Set();
let scanning = false;

const parseLrc = (value) => String(value || "").split(/\r?\n/).flatMap((row) => {
  const stamps = [...row.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g)];
  const text = row.replace(/\[[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
  return stamps.map((stamp) => ({ time: Number(stamp[1]) * 60 + Number(stamp[2]), text }));
}).sort((a, b) => a.time - b.time);

const artistView = (row) => ({
  id: row.id, musicbrainzId: row.musicbrainz_id, name: row.name, sortName: row.sort_name,
  country: row.country, disambiguation: row.disambiguation, type: row.artist_type,
  status: row.scan_status, discoveredCount: row.discovered_count, learnableCount: row.learnable_count,
  error: row.error, lastScannedAt: row.last_scanned_at
});

const itemView = (row) => ({
  id: row.id, title: row.title, album: row.album, duration: row.duration_seconds,
  trackId: row.track_id, ready: Boolean(row.media_id), artwork: row.artwork_id ? `/api/media/artwork/${row.artwork_id}` : row.track_artwork_url || row.artwork_url || ""
});

const existingTrackFor = (lrclibId) => {
  const direct = repositories.tracks.findByExternalId("lrclib", String(lrclibId));
  if (direct) return direct;
  const lyrics = repositories.lyrics.findByExternalId("lrclib", String(lrclibId));
  return lyrics ? repositories.tracks.findById(lyrics.track_id) : null;
};

const verifyCatalogItem = async (item, artist) => {
  const existingTrack = existingTrackFor(item.lrclib_id);
  if (existingTrack) {
    repositories.artists.linkTrack(item.id, existingTrack.id);
    const lesson = getCachedLessonByTrackId(existingTrack.id);
    if (lesson?.streamUrl) { repositories.artists.setTrack(item.id, existingTrack.id); return true; }
  }
  // A previous scan already matched this exact lyrics record to playable audio.
  // Keep that durable verification instead of invoking yt-dlp again on every
  // rescan or process restart.
  if (["verified", "ready"].includes(item.status) && item.audio_provider_id) return true;
  const cached = repositories.search.findVerifiedByLrclibId(item.lrclib_id);
  if (cached) {
    repositories.artists.setVerification(item.id, { status: "verified", audioProviderId: cached.audio_provider_id,
      audioWebpageUrl: cached.audio_webpage_url, audioDurationSeconds: cached.audio_duration_seconds,
      artworkUrl: cached.artwork_url });
    return true;
  }
  const candidate = { id: item.lrclib_id, trackName: item.title, artistName: artist.name, albumName: item.album,
    duration: item.duration_seconds, syncedLyrics: item.synced_lyrics };
  try {
    const audio = await inspectSearchResult(`${artist.name} ${item.title} audio`, { timeoutMs: 30000 });
    if (!rankCandidate({ candidate, audio, query: `${artist.name} ${item.title}` })) throw new Error("Audio mismatch");
    repositories.artists.setVerification(item.id, { status: "verified", audioProviderId: audio.sourceId,
      audioWebpageUrl: audio.webpageUrl, audioDurationSeconds: audio.duration, artworkUrl: audio.thumbnail });
    return true;
  } catch {
    repositories.artists.setVerification(item.id, { status: "unavailable" });
    return false;
  }
};

const verifyItems = async (items, artist) => {
  const pending = items.filter((item) => !["verified", "ready"].includes(item.status) || !item.audio_provider_id);
  for (let index = 0; index < pending.length; index += 2) {
    await Promise.all(pending.slice(index, index + 2).map((item) => verifyCatalogItem(item, artist)));
    repositories.artists.updateScan(artist.id, { learnableCount: repositories.artists.catalog(artist.id).length });
  }
};

const findSyncedLyrics = async (recording, artist) => {
  const query = new URLSearchParams({ track_name: recording.title, artist_name: artist.name });
  const response = await fetch(`https://lrclib.net/api/search?${query}`, {
    headers: { "User-Agent": "Translator/1.0 (artist catalog)" }, signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) return null;
  const wantedTitle = normalizeSearchText(recording.title), wantedArtist = normalizeSearchText(artist.name);
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : []).find((row) => normalizeSearchText(row.trackName) === wantedTitle &&
    normalizeSearchText(row.artistName).includes(wantedArtist) && row.syncedLyrics && parseLrc(row.syncedLyrics).some((line) => line.text)) || null;
};

const findArtistLyrics = async (artist) => {
  let response;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(artist.name)}`, {
        headers: { "User-Agent": "Translator/1.0 (artist catalog)" }, signal: AbortSignal.timeout(60000)
      });
      break;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  if (!response?.ok) throw new Error(`Lyrics catalog returned HTTP ${response?.status || 503}.`);
  const wanted = normalizeSearchText(artist.name);
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : []).filter((row) => normalizeSearchText(row.artistName) === wanted &&
    row.syncedLyrics && parseLrc(row.syncedLyrics).some((line) => line.text));
};

const runScan = async (artist) => {
  try {
    repositories.artists.updateScan(artist.id, { scanStatus: "scanning", error: null });
    const seedRows = await findArtistLyrics(artist).catch(() => []);
    const seedSeen = new Set();
    const seedItems = [];
    for (const lyrics of seedRows) {
      const key = normalizeSearchText(lyrics.trackName);
      if (!key || seedSeen.has(key)) continue;
      seedSeen.add(key);
      seedItems.push(repositories.artists.addCatalogItem({ artistId: artist.id, lrclibId: Number(lyrics.id),
        title: lyrics.trackName, album: lyrics.albumName || "", durationSeconds: Number(lyrics.duration) || null,
        syncedLyrics: lyrics.syncedLyrics }));
    }
    await verifyItems(seedItems, artist);
    const seeded = repositories.artists.catalog(artist.id).length;
    repositories.artists.updateScan(artist.id, { discoveredCount: seedRows.length, learnableCount: seeded });
    if (artist.musicbrainz_id.startsWith("name_")) {
      const learnable = repositories.artists.catalog(artist.id).length;
      repositories.artists.updateScan(artist.id, { scanStatus: "completed", discoveredCount: seedRows.length, learnableCount: learnable, error: null });
      return;
    }
    const all = await browseArtistRecordings(artist.musicbrainz_id, ({ loaded, total }) => {
      repositories.artists.updateScan(artist.id, { discoveredCount: loaded });
      if (total > 2000) throw new Error("The extended catalog is too large for a single sync pass.");
    });
    // Seed results have already been checked. Do not discover and verify the
    // same title a second time through MusicBrainz under a different LRCLIB id.
    const seen = new Set(repositories.artists.catalog(artist.id).map((item) => normalizeSearchText(item.title)));
    const recordings = all.filter((item) => {
      const key = normalizeSearchText(item.title);
      if (!key || seen.has(key) || /\b(live|karaoke|instrumental|remix)\b/i.test(item.title)) return false;
      seen.add(key); return true;
    });
    repositories.artists.updateScan(artist.id, { discoveredCount: recordings.length });
    let learnable = repositories.artists.catalog(artist.id).length;
    for (let index = 0; index < recordings.length; index += 4) {
      const batch = recordings.slice(index, index + 4);
      const matches = await Promise.all(batch.map((recording) => findSyncedLyrics(recording, artist).catch(() => null)));
      const items = [];
      matches.forEach((lyrics, position) => {
        if (!lyrics) return;
        const recording = batch[position];
        items.push(repositories.artists.addCatalogItem({ artistId: artist.id, musicbrainzRecordingId: recording.id,
          lrclibId: Number(lyrics.id), title: lyrics.trackName, album: lyrics.albumName || "",
          durationSeconds: Number(lyrics.duration) || recording.duration, syncedLyrics: lyrics.syncedLyrics }));
      });
      await verifyItems(items, artist);
      learnable = repositories.artists.catalog(artist.id).length;
      repositories.artists.updateScan(artist.id, { learnableCount: learnable });
    }
    repositories.artists.updateScan(artist.id, { scanStatus: "completed", discoveredCount: recordings.length, learnableCount: learnable, error: null });
  } catch (error) {
    const learnable = repositories.artists.catalog(artist.id).length;
    repositories.artists.updateScan(artist.id, { scanStatus: learnable ? "completed" : "failed", learnableCount: learnable,
      error: learnable ? null : error.message || "Artist scan failed." });
  }
};

const verifyRecoveredItems = async (artist) => {
  try {
    repositories.artists.updateScan(artist.id, { scanStatus: "scanning", error: null });
    const pending = repositories.artists.needsVerification(artist.id);
    await verifyItems(pending, artist);
    repositories.artists.updateScan(artist.id, {
      scanStatus: "completed", learnableCount: repositories.artists.catalog(artist.id).length, error: null
    });
  } catch (error) {
    repositories.artists.updateScan(artist.id, { scanStatus: "failed", error: error.message || "Artist verification failed." });
  }
};

const drain = () => {
  if (scanning || !scanQueue.length) return;
  const task = scanQueue.shift(); scanning = true;
  void (task.verifyOnly ? verifyRecoveredItems(task.artist) : runScan(task.artist))
    .finally(() => { queued.delete(task.artist.id); scanning = false; drain(); });
};

const enqueue = (artist, { verifyOnly = false } = {}) => {
  if (!artist || queued.has(artist.id)) return;
  queued.add(artist.id); scanQueue.push({ artist, verifyOnly });
  repositories.artists.updateScan(artist.id, { scanStatus: "queued", error: null }); drain();
};

export const discoverArtists = async (name) => {
  const query = String(name || "").trim();
  if (!query) throw new TypeError("Artist name is required.");
  const artists = await searchMusicBrainzArtists(query);
  if (artists.length) return artists;
  return [{ musicbrainzId: `name_${crypto.createHash("sha256").update(normalizeSearchText(query)).digest("hex").slice(0, 32)}`,
    name: query, sortName: query, country: "", disambiguation: "Lyrics catalog", type: "Artist", score: 50, fallback: true }];
};

export const createArtistCatalog = (profile) => {
  if (!profile?.musicbrainzId || !profile?.name) throw new TypeError("A MusicBrainz artist is required.");
  const artist = repositories.artists.upsert(profile);
  if (artist.scan_status !== "completed") enqueue(artist);
  return getArtistCatalog(artist.id);
};

export const getArtistCatalog = (id) => {
  const artist = repositories.artists.findById(id);
  if (!artist) return null;
  return { ...artistView(artist), tracks: repositories.artists.catalog(id).map(itemView) };
};

export const prepareArtistCatalogItem = async (id) => {
  let item = repositories.artists.catalogItem(id);
  if (!item) return null;
  const artist = repositories.artists.findById(item.artist_id);
  const existingTrack = item.track_id ? repositories.tracks.findById(item.track_id) : existingTrackFor(item.lrclib_id);
  if (existingTrack) {
    repositories.artists.linkTrack(item.id, existingTrack.id);
    const lesson = getCachedLessonByTrackId(existingTrack.id);
    if (lesson?.streamUrl) { repositories.artists.setTrack(item.id, existingTrack.id); return lesson; }
  }
  if (!['verified','ready'].includes(item.status)) {
    if (!await verifyCatalogItem(item, artist)) throw new Error("A matching playable version was not found.");
    item = repositories.artists.catalogItem(id);
  }
  if (existingTrack) return { ...getCachedLessonByTrackId(existingTrack.id), verifiedAudio: {
    providerId: item.audio_provider_id, webpageUrl: item.audio_webpage_url, duration: item.audio_duration_seconds
  }};
  const ids = await cacheTrackLyrics({ lrclibId: item.lrclib_id, title: item.title, artist: artist.name,
    album: item.album, duration: item.duration_seconds, artwork: item.artwork_url, sourceUrl: "", lines: parseLrc(item.synced_lyrics) });
  repositories.artists.setTrack(item.id, ids.trackId);
  return { ...getCachedLessonByTrackId(ids.trackId), verifiedAudio: {
    providerId: item.audio_provider_id, webpageUrl: item.audio_webpage_url, duration: item.audio_duration_seconds
  }};
};

for (const artist of repositories.artists.scanning()) enqueue(artist);

const legacyItems = repositories.artists.needsVerification();
for (const artistId of new Set(legacyItems.map((item) => item.artist_id))) {
  const artist = repositories.artists.findById(artistId);
  if (artist) enqueue(artist, { verifyOnly: true });
}
