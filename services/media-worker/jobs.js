import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";
import { resolvePlatform } from "./adapters/platforms.js";
import { createStorageTarget, removeDirectory } from "./storage.js";
import { inspectWithYtDlp, downloadWithSpotDl, downloadWithYtDlp } from "./downloader.js";

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

const touch = (job, patch) => Object.assign(job, patch, { updatedAt: new Date().toISOString() });

export const friendlyMediaError = (error, platform) => {
  const message = error?.message || "Media processing failed";
  if (platform.id === "youtube" && /sign in to confirm you.?re not a bot|confirm you.?re not a bot/i.test(message)) {
    return "YouTube requires sign-in verification from this server. Configure MEDIA_YTDLP_COOKIES_FILE with an authorized cookies file, then try again.";
  }
  if (platform.id === "spotify" && /could not get general hashes/i.test(message)) {
    return "Spotify metadata access failed. Configure SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET for the official Spotify API, then try again.";
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
    } else {
      metadata = { title: "Spotify track", creator: "", duration: null, thumbnail: "", kind: "audio", webpageUrl: job.url };
      job.metadata = metadata;
    }

    touch(job, { status: "downloading", stage: "Retrieving media", progress: 5 });
    const result = job.platform.engine === "spotdl"
      ? await downloadWithSpotDl({ url: job.url, directory: target.directory, onProgress: (progress) => touch(job, { progress }) })
      : await downloadWithYtDlp({ url: job.url, directory: target.directory, onProgress: (progress) => touch(job, { progress }) });
    if (!result) throw new Error("The media tool completed without producing a playable file.");
    if (result.stat.size > config.maxBytes) throw new Error("The prepared media exceeds the server size limit.");

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
      sourceUrl: job.url,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + config.retentionMs).toISOString()
    };
    media.set(item.id, item);
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
  const job = { id: crypto.randomUUID(), url: platform.url, platform, status: "queued", stage: "Queued", progress: 0, metadata: null, media: null, error: null, createdAt: now, updatedAt: now };
  jobs.set(job.id, job);
  queue.push(job);
  drain();
  return publicJob(job);
};

export const getJob = (id) => publicJob(jobs.get(id));
export const getMedia = (id) => media.get(id) || null;
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
    if (Date.parse(item.expiresAt) <= now) deleteMedia(id);
  }
};
