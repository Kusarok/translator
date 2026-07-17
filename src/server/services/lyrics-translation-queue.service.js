import { getCachedLessonByTrackId, getDueLyricsTranslations, scheduleLyricsTranslation, updateLyricsTranslationJob } from "./media-worker.service.js";
import { translateLyrics } from "./lyrics.service.js";

const RETRY_DELAYS_MS = [30_000, 120_000, 300_000, 900_000, 3_600_000, 10_800_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
let timer = null;
let processing = false;

const safeError = (error) => String(error?.message || "Translation failed").slice(0, 500);
const nextDelay = (attempts) => RETRY_DELAYS_MS[Math.min(RETRY_DELAYS_MS.length - 1, Math.max(0, attempts - 1))];

export const scheduleLyricsTranslationRetry = async ({ trackId, error, attempts = 1 }) => {
  const result = await scheduleLyricsTranslation({
    trackId,
    targetLanguage: "fa",
    attempts,
    delayMs: nextDelay(attempts),
    lastError: safeError(error)
  });
  return result.data;
};

const processJob = async (job) => {
  const started = await updateLyricsTranslationJob(job.id, { status: "running" });
  const attempts = Number(started.data?.attempts || job.attempts + 1);
  try {
    const cached = await getCachedLessonByTrackId(job.trackId);
    const lesson = cached.data;
    if (!lesson?.lines?.length) throw new Error("Cached lyrics are unavailable.");
    await translateLyrics({
      spotifyId: lesson.spotifyId,
      trackId: lesson.trackId,
      lines: lesson.lines.map((line) => line.text),
      authenticated: true
    });
    await updateLyricsTranslationJob(job.id, { status: "completed" });
  } catch (error) {
    const message = safeError(error);
    console.warn(`Lyrics translation retry ${attempts} failed for ${job.trackId}: ${message}`);
    if (attempts >= MAX_ATTEMPTS) {
      await updateLyricsTranslationJob(job.id, { status: "failed", lastError: message });
      return;
    }
    await updateLyricsTranslationJob(job.id, {
      status: "retry",
      nextAttemptAt: new Date(Date.now() + nextDelay(attempts)).toISOString(),
      lastError: message
    });
  }
};

export const runDueLyricsTranslations = async () => {
  if (processing) return;
  processing = true;
  try {
    const result = await getDueLyricsTranslations(2);
    for (const job of result.data?.jobs || []) await processJob(job);
  } catch (error) {
    console.warn(`Lyrics translation queue is temporarily unavailable: ${safeError(error)}`);
  } finally {
    processing = false;
  }
};

export const startLyricsTranslationQueue = () => {
  if (timer) return;
  setTimeout(runDueLyricsTranslations, 2_000).unref();
  timer = setInterval(runDueLyricsTranslations, 15_000);
  timer.unref();
};
