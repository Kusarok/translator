import { repositories } from "../persistence.js";
import { getCachedLessonByTrackId } from "./lesson-cache.service.js";

const MAX_DELAY_MS = 24 * 60 * 60 * 1000;
const publicStatus = (status) => status === "completed" ? "ready" : status === "failed" ? "failed" : "pending";

export const publicTranslationJob = (job) => job && ({
  id: job.id,
  trackId: job.track_id,
  targetLanguage: job.target_language,
  status: publicStatus(job.status),
  attempts: job.attempts,
  updatedAt: job.updated_at
});

export const scheduleTranslationJob = ({ trackId, targetLanguage = "fa", delayMs = 0, attempts, lastError }) => {
  const lesson = getCachedLessonByTrackId(trackId);
  if (!lesson) return null;
  const current = repositories.lyricTranslationJobs.findForTrack(trackId, targetLanguage);
  if (lesson.translationCached) {
    const completed = current
      ? repositories.lyricTranslationJobs.complete(current.id)
      : repositories.lyricTranslationJobs.schedule({ trackId, targetLanguage, status: "completed" });
    return publicTranslationJob(completed);
  }
  const delay = Math.min(MAX_DELAY_MS, Math.max(0, Number(delayMs) || 0));
  const job = repositories.lyricTranslationJobs.schedule({
    trackId,
    targetLanguage,
    status: delay ? "retry" : "queued",
    attempts: attempts ?? current?.attempts ?? 0,
    nextAttemptAt: new Date(Date.now() + delay).toISOString(),
    lastError: lastError || null
  });
  return publicTranslationJob(job);
};

export const getTranslationJobForTrack = (trackId, targetLanguage = "fa") => {
  const lesson = getCachedLessonByTrackId(trackId);
  if (!lesson) return null;
  if (lesson.translationCached) return { status: "ready", trackId, targetLanguage, translations: lesson.lines.map((line) => line.translation || "") };
  const job = repositories.lyricTranslationJobs.findForTrack(trackId, targetLanguage);
  return job ? publicTranslationJob(job) : { status: "missing", trackId, targetLanguage };
};

export const dueTranslationJobs = (limit = 2) => repositories.lyricTranslationJobs.due(Math.min(4, Math.max(1, Number(limit) || 2)));

export const updateTranslationJob = (id, patch) => {
  const current = repositories.lyricTranslationJobs.findById(id);
  if (!current) return null;
  if (patch.status === "running") return repositories.lyricTranslationJobs.start(id);
  if (patch.status === "completed") return repositories.lyricTranslationJobs.complete(id);
  if (patch.status === "failed") return repositories.lyricTranslationJobs.fail(id, patch.lastError || "Translation failed");
  if (patch.status === "retry") return repositories.lyricTranslationJobs.retry(id, {
    nextAttemptAt: patch.nextAttemptAt || new Date().toISOString(),
    lastError: patch.lastError || "Translation will be retried"
  });
  return current;
};
