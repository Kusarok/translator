import path from "node:path";
import { fileURLToPath } from "node:url";

const serviceDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(serviceDir, "../..");
const positive = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

export const config = {
  host: process.env.MEDIA_WORKER_HOST || "127.0.0.1",
  port: positive(process.env.MEDIA_WORKER_PORT, 8090),
  storageDir: process.env.MEDIA_STORAGE_DIR || path.join(rootDir, "data", "media"),
  python: process.env.MEDIA_PYTHON || path.join(serviceDir, ".venv", "bin", "python"),
  maxBytes: positive(process.env.MEDIA_MAX_BYTES, 350 * 1024 * 1024),
  maxDurationSeconds: positive(process.env.MEDIA_MAX_DURATION_SECONDS, 60 * 60),
  timeoutMs: positive(process.env.MEDIA_JOB_TIMEOUT_MS, 20 * 60 * 1000),
  retentionMs: positive(process.env.MEDIA_RETENTION_HOURS, 24) * 60 * 60 * 1000,
  maxConcurrent: positive(process.env.MEDIA_MAX_CONCURRENT, 1),
  ytDlpCookiesFile: process.env.MEDIA_YTDLP_COOKIES_FILE || "",
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || "",
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || ""
};
