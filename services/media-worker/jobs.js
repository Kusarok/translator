import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";
import { repositories } from "./persistence.js";
import { findTrackForReference } from "./services/lesson-cache.service.js";
import { resolvePlatform } from "./adapters/platforms.js";
import searchPlatform from "./adapters/search.js";
import { createStorageTarget, removeDirectory } from "./storage.js";
import { inspectWithYtDlp, inspectSearchResult, downloadWithSpotDl, downloadWithYtDlp, searchAndDownloadWithYtDlp } from "./downloader.js";

const jobs = new Map();
const media = new Map();
const queue = [];
let active = 0;

const publicMedia = (item) => item && ({
  id: item.id,
  title: item.title,
  creator: item.creator,
  platform: item.platform,
  platformLabel: item.platformLabel,
  duration: item.duration,
  thumbnail: item.thumbnail,
  kind: item.kind,
  mimeType: item.mimeType,
  filename: item.filename,
  size: item.size,
  disclosure: item.disclosure,
  sourceUrl: item.sourceUrl,
  createdAt: item.createdAt,
  expiresAt: item.expiresAt,
  streamUrl: `/api/media/${item.id}/stream`,
  downloadUrl: `/api/media/${item.id}/download`
});

export const publicJob = (job) => job && ({
  id: job.id,
  status: job.status,
  stage: job.stage,
  progress: job.progress,
  platform: job.platform.id,
  platformLabel: job.platform.label,
  experimental: Boolean(job.platform.experimental),
  disclosure: job.platform.disclosure || "",
  metadata: job.metadata,
  media: publicMedia(job.media),
  error: job.error,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt
});

const mimeFor = (filename, kind) => {
  const ext = path.extname(filename).toLowerCase();
  const types = { ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".opus": "audio/ogg", ".ogg": "audio/ogg" };
  return types[ext] || (kind === "audio" ? "audio/mpeg" : "video/mp4");
};

const checksumFile = (filePath) => new Promise((resolve, reject) => {
  const digest = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  stream.on("data", (chunk) => digest.update(chunk));
  stream.on("end", () => resolve(digest.digest("hex")));
  stream.on("error", reject);
});

const persistJob = (job) => {
  const linkedTrack = findTrackForReference(job.url);
  const current = repositories.jobs.findById(job.id);
  const values = {
    trackId: linkedTrack?.id || null,
    jobType: job.platform?.engine || "media",
    status: job.status,
    progress: job.progress || 0,
    attempts: current?.attempts || 0,
    error: job.error || null,
    resultId: job.media?.id || null
  };
  if (current) repositories.jobs.update(job.id, values);
  else repositories.jobs.create({ id: job.id, ...values });
  const directory = path.join(config.jobsDir, job.id);
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, "status.json");
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(publicJob(job), null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
};

const touch = (job, patch) => {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  persistJob(job);
  return job;
};

const mediaFromRow = (row) => row && ({
  id: row.id,
  filePath: path.resolve(config.dataDir, row.relative_path),
  directory: path.dirname(path.resolve(config.dataDir, row.relative_path)),
  title: "Cached audio",
  creator: "",
  platform: row.provider,
  platformLabel: "YouTube Music",
  duration: row.duration_seconds,
  thumbnail: "",
  kind: row.kind,
  mimeType: row.mime_type,
  filename: path.basename(row.relative_path),
  size: row.size_bytes,
  disclosure: "Cached audio",
  sourceUrl: "",
  createdAt: row.created_at,
  expiresAt: null
});

export const friendlyMediaError = (error, platform) => {
  const message = error?.message || "Media processing failed";
  if (/sign in to confirm you.?re not a bot|confirm you.?re not a bot/i.test(message)) {
    return "YouTube requires sign-in verification. Configure MEDIA_YTDLP_COOKIES_FILE with an authorized cookies file, then try again.";
  }
  if (/could not get general hashes/i.test(message)) {
    return "Audio metadata access failed. The VPN or YouTube Music API may be temporarily unavailable.";
  }
  if (/exec vpnns|network namespace|netns/i.test(message)) {
    return "The VPN service (vpnns) is not running. Start it with: systemctl start vpnns";
  }
  return message;
};

const execute = async (job) => {
  active += 1;
  const target = createStorageTarget();
  job.directory = target.directory;
  try {
    let metadata;
    if (job.platform.engine === "yt-dlp") {
      touch(job, { status: "inspecting", stage: "Inspecting public media", progress: 2 });
      metadata = await inspectWithYtDlp(job.url);
      job.metadata = metadata;
    } else if (job.platform.engine === "yt-dlp-search") {
      touch(job, { status: "inspecting", stage: "Searching YouTube Music", progress: 3 });
      metadata = await inspectSearchResult(job.query);
      job.metadata = metadata;
    } else {
      metadata = { title: "Spotify track", creator: "", duration: null, thumbnail: "", kind: "audio", webpageUrl: job.url };
      job.metadata = metadata;
    }

    touch(job, { status: "downloading", stage: "Retrieving media", progress: 5 });
    let result;
    if (job.platform.engine === "spotdl") {
      result = await downloadWithSpotDl({ url: job.url, directory: target.directory, onProgress: (progress) => touch(job, { progress }) });
    } else if (job.platform.engine === "yt-dlp-search") {
      result = await searchAndDownloadWithYtDlp({ query: job.query, directory: target.directory, onProgress: (progress) => touch(job, { progress }) });
    } else {
      result = await downloadWithYtDlp({ url: job.url, directory: target.directory, onProgress: (progress) => touch(job, { progress }) });
    }
    if (!result) throw new Error("The media tool completed without producing a playable file.");
    if (result.stat.size > config.maxBytes) throw new Error("The prepared media exceeds the server size limit.");
    const checksum = await checksumFile(result.filePath);

    touch(job, { status: "processing", stage: "Preparing playback", progress: 97 });
    const item = {
      id: target.id,
      filePath: result.filePath,
      directory: target.directory,
      title: metadata.title === "Spotify track" ? path.parse(result.filePath).name : metadata.title,
      creator: metadata.creator,
      platform: job.platform.id,
      platformLabel: job.platform.label,
      duration: metadata.duration,
      thumbnail: metadata.thumbnail,
      kind: job.platform.id === "spotify" ? "audio" : metadata.kind,
      mimeType: mimeFor(result.filePath, metadata.kind),
      filename: path.basename(result.filePath),
      size: result.stat.size,
      disclosure: job.platform.disclosure || "",
      sourceUrl: job.url || metadata.webpageUrl || "",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + config.retentionMs).toISOString()
    };
    media.set(item.id, item);
    const linkedTrack = findTrackForReference(job.url);
    if (linkedTrack) {
      item.expiresAt = null;
      repositories.media.upsert({
        id: item.id, trackId: linkedTrack.id, provider: item.platform,
        providerMediaId: null, kind: item.kind,
        relativePath: path.relative(config.dataDir, item.filePath).split(path.sep).join("/"),
        mimeType: item.mimeType, sizeBytes: item.size, durationSeconds: item.duration, checksum,
        status: "ready", lastVerifiedAt: new Date().toISOString()
      });
      fs.writeFileSync(path.join(item.directory, "metadata.json"), `${JSON.stringify({
        mediaId: item.id, trackId: linkedTrack.id, title: item.title, creator: item.creator,
        sourceUrl: item.sourceUrl, mimeType: item.mimeType, size: item.size, duration: item.duration
      }, null, 2)}\n`, "utf8");
      fs.writeFileSync(path.join(item.directory, "checksum.sha256"), `${checksum}  ${item.filename}\n`, "utf8");
    }
    touch(job, { status: "completed", stage: "Ready", progress: 100, media: item });
  } catch (error) {
    removeDirectory(target.directory);
    touch(job, { status: "failed", stage: "Failed", error: friendlyMediaError(error, job.platform) });
  } finally {
    active -= 1;
    drain();
  }
};

const drain = () => {
  while (active < config.maxConcurrent && queue.length) execute(queue.shift());
};

export const createJob = (url) => {
  const platform = resolvePlatform(url);
  const now = new Date().toISOString();
  const job = { id: `job_${crypto.randomUUID()}`, url: platform.url, platform, status: "queued", stage: "Queued", progress: 0, metadata: null, media: null, error: null, createdAt: now, updatedAt: now };
  jobs.set(job.id, job);
  persistJob(job);
  queue.push(job);
  drain();
  return publicJob(job);
};

export const createSearchJob = (query, referenceUrl = "") => {
  const linkedTrack = findTrackForReference(referenceUrl);
  const cachedMedia = linkedTrack && repositories.media.findReadyForTrack(linkedTrack.id);
  if (cachedMedia) {
    const item = mediaFromRow(cachedMedia);
    if (item && fs.existsSync(item.filePath)) {
      media.set(item.id, item);
      const now = new Date().toISOString();
      const job = { id: `job_${crypto.randomUUID()}`, url: referenceUrl, query, platform: searchPlatform,
        status: "completed", stage: "Ready from cache", progress: 100, metadata: null, media: item,
        error: null, createdAt: now, updatedAt: now };
      jobs.set(job.id, job);
      persistJob(job);
      return publicJob(job);
    }
  }
  const duplicate = [...jobs.values()].find((job) => job.url === referenceUrl && job.query === query &&
    !["completed", "failed"].includes(job.status));
  if (duplicate) return publicJob(duplicate);
  const now = new Date().toISOString();
  const job = { id: `job_${crypto.randomUUID()}`, url: referenceUrl, query, platform: searchPlatform, status: "queued", stage: "Queued", progress: 0, metadata: null, media: null, error: null, createdAt: now, updatedAt: now };
  jobs.set(job.id, job);
  persistJob(job);
  queue.push(job);
  drain();
  return publicJob(job);
};

export const getJob = (id) => publicJob(jobs.get(id));
export const getMedia = (id) => {
  const current = media.get(id);
  if (current) return current;
  const restored = mediaFromRow(repositories.media.findById(id));
  if (!restored || !fs.existsSync(restored.filePath)) return null;
  media.set(id, restored);
  return restored;
};
export const deleteMedia = (id) => {
  const item = media.get(id);
  if (!item) return false;
  removeDirectory(item.directory);
  media.delete(id);
  return true;
};

export const cleanupExpired = () => {
  const now = Date.now();
  for (const [id, item] of media) {
    if (item.expiresAt && Date.parse(item.expiresAt) <= now) deleteMedia(id);
  }
};
