import crypto from "node:crypto";
import { inspectSearchResult } from "../../downloader.js";
import { repositories } from "../../persistence.js";
import { getCachedLessonByTrackId, cacheTrackLyrics } from "../../services/lesson-cache.service.js";
import { dedupeCandidates, rankCandidate } from "./result-ranker.js";
import { ftsPhrase, normalizeSearchText, validateSearchQuery } from "./query-normalizer.js";
import { config } from "../../config.js";

const MAX_LYRICS_CANDIDATES = 20;
const AUDIO_VERIFICATION_BATCH_SIZE = 4;
const searchQueue = [];
const queuedIds = new Set();
let activeSearches = 0;

const publicResult = (row) => ({
  id: row.id, trackId: row.track_id, lrclibId: row.lrclib_id, title: row.title, artist: row.artist,
  album: row.album, duration: row.duration_seconds, matchedLine: row.matched_line,
  artwork: row.artwork_url || "", score: row.score, cached: Boolean(row.track_id),
  audioVerified: Boolean(row.audio_provider_id), status: row.status
});

const publicJob = (job) => {
  const seen = new Set();
  const results = repositories.search.results(job.id).filter((row) => {
    const key = `${normalizeSearchText(row.title)}|${normalizeSearchText(row.artist)}|${Math.round(Number(row.duration_seconds || 0) / 3)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map(publicResult);
  return { id: job.id, query: job.query, status: job.status, candidatesFound: job.candidates_found,
    lyricsVerified: job.lyrics_verified, audioVerified: job.audio_verified, error: job.error, results };
};

const parseLrc = (value) => String(value || "").split(/\r?\n/).flatMap((row) => {
  const stamps = [...row.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g)];
  const text = row.replace(/\[[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
  return stamps.map((stamp) => ({ time: Number(stamp[1]) * 60 + Number(stamp[2]), text }));
}).sort((a, b) => a.time - b.time);

// Locally cached tracks may not have an LRCLIB id. A stable negative key keeps
// them distinct without colliding with real (positive) LRCLIB identifiers.
const localResultId = (trackId) => -Number.parseInt(
  crypto.createHash("sha256").update(String(trackId)).digest("hex").slice(0, 12), 16
);

const searchLrclib = async (query) => {
  const response = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": "Translator/1.0 (lyrics-first search)" }, signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Lyrics search returned HTTP ${response.status}.`);
  const rows = await response.json();
  return dedupeCandidates((Array.isArray(rows) ? rows : []).filter((row) => row.syncedLyrics && parseLrc(row.syncedLyrics).some((line) => line.text))).slice(0, MAX_LYRICS_CANDIDATES);
};

const addCachedResults = (job, normalized) => {
  let rows = [];
  try { rows = repositories.search.local(ftsPhrase(normalized), 20); } catch { return 0; }
  for (const row of rows) {
    const lesson = getCachedLessonByTrackId(row.track_id);
    if (!lesson?.streamUrl) continue;
    repositories.search.addResult({ searchJobId: job.id, lrclibId: Number(lesson.lrclibId) || localResultId(row.track_id),
      trackId: row.track_id, title: row.title, artist: row.artist, album: row.album,
      durationSeconds: lesson.duration, syncedLyrics: "cached", matchedLine: row.matched_line?.replace(/<\/?mark>/g, ""),
      audioProviderId: lesson.mediaId, audioDurationSeconds: lesson.duration, artworkUrl: lesson.artwork,
      score: 200 - Number(row.rank || 0), status: "ready" });
  }
  return rows.length;
};

const verifyCandidate = async (jobId, candidate, query) => {
  try {
    const audio = await inspectSearchResult(`${candidate.artistName} ${candidate.trackName} audio`, { timeoutMs: 30000 });
    const ranked = rankCandidate({ candidate, audio, query });
    if (!ranked) return false;
    repositories.search.addResult({ searchJobId: jobId, lrclibId: candidate.id, title: candidate.trackName,
      artist: candidate.artistName, album: candidate.albumName, durationSeconds: Number(candidate.duration),
      syncedLyrics: candidate.syncedLyrics, matchedLine: ranked.lyricMatch,
      audioProviderId: audio.sourceId, audioWebpageUrl: audio.webpageUrl, audioDurationSeconds: audio.duration,
      artworkUrl: audio.thumbnail, score: ranked.score, status: "ready" });
    return true;
  } catch { return false; }
};

const runSearch = async (job) => {
  try {
    repositories.search.updateJob(job.id, { status: "searching" });
    const cachedCount = addCachedResults(job, job.normalized_query);
    const candidates = await searchLrclib(job.query);
    repositories.search.updateJob(job.id, { status: "verifying", candidatesFound: candidates.length, lyricsVerified: candidates.length });
    let verified = cachedCount;
    for (let index = 0; index < candidates.length; index += AUDIO_VERIFICATION_BATCH_SIZE) {
      const batch = await Promise.all(candidates.slice(index, index + AUDIO_VERIFICATION_BATCH_SIZE).map((candidate) => verifyCandidate(job.id, candidate, job.query)));
      verified += batch.filter(Boolean).length;
      repositories.search.updateJob(job.id, { audioVerified: verified });
    }
    repositories.search.updateJob(job.id, { status: "completed", audioVerified: repositories.search.results(job.id).length });
  } catch (error) {
    repositories.search.updateJob(job.id, { status: "failed", error: error.message || "Search failed." });
  }
};

const drainSearchQueue = () => {
  while (activeSearches < config.maxConcurrentSearches && searchQueue.length) {
    const job = searchQueue.shift(); queuedIds.delete(job.id); activeSearches += 1;
    void runSearch(job).finally(() => { activeSearches -= 1; drainSearchQueue(); });
  }
};

const enqueueSearch = (job) => {
  if (!job || queuedIds.has(job.id)) return;
  queuedIds.add(job.id); searchQueue.push(job); drainSearchQueue();
};

export const createLyricsSearch = (value) => {
  const { query, normalized } = validateSearchQuery(value);
  const existing = repositories.search.findActive(normalized) || repositories.search.findCached(normalized, new Date(Date.now() - config.searchCacheMs).toISOString());
  if (existing) return publicJob(existing);
  const job = repositories.search.createJob(query, normalized);
  enqueueSearch(job);
  return publicJob(job);
};

export const getLyricsSearch = (id) => {
  const job = repositories.search.job(id);
  return job ? publicJob(job) : null;
};

export const prepareSearchResult = async (id) => {
  const result = repositories.search.result(id);
  if (!result || result.status !== "ready") return null;
  if (result.track_id) return getCachedLessonByTrackId(result.track_id);
  const lines = parseLrc(result.synced_lyrics);
  const ids = await cacheTrackLyrics({ lrclibId: result.lrclib_id, title: result.title, artist: result.artist,
    album: result.album, duration: result.duration_seconds, artwork: result.artwork_url, sourceUrl: "", lines });
  return { ...getCachedLessonByTrackId(ids.trackId), verifiedAudio: {
    providerId: result.audio_provider_id, webpageUrl: result.audio_webpage_url, duration: result.audio_duration_seconds
  }};
};

for (const job of repositories.search.recoverable()) enqueueSearch(job);
