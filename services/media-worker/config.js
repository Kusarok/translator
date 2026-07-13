import path from "node:path";
import { fileURLToPath } from "node:url";

const serviceDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(serviceDir, "../..");
const dataDir = process.env.MEDIA_DATA_DIR || path.join(rootDir, "data");
const positive = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

export const config = {
  host: process.env.MEDIA_WORKER_HOST || "127.0.0.1",
  port: positive(process.env.MEDIA_WORKER_PORT, 8090),
  dataDir,
  storageDir: process.env.MEDIA_STORAGE_DIR || path.join(dataDir, "media"),
  tempDir: path.join(dataDir, "temp"),
  databaseDir: path.join(dataDir, "database"),
  tracksDir: path.join(dataDir, "tracks"),
  lyricsDir: path.join(dataDir, "lyrics"),
  translationsDir: path.join(dataDir, "translations"),
  artworkDir: path.join(dataDir, "artwork"),
  jobsDir: path.join(dataDir, "jobs"),
  python: process.env.MEDIA_PYTHON || path.join(serviceDir, ".venv", "bin", "python"),
  maxBytes: positive(process.env.MEDIA_MAX_BYTES, 350 * 1024 * 1024),
  maxDurationSeconds: positive(process.env.MEDIA_MAX_DURATION_SECONDS, 60 * 60),
  timeoutMs: positive(process.env.MEDIA_JOB_TIMEOUT_MS, 20 * 60 * 1000),
  retentionMs: positive(process.env.MEDIA_RETENTION_HOURS, 24) * 60 * 60 * 1000,
  maxConcurrent: positive(process.env.MEDIA_MAX_CONCURRENT, 1),
  maxConcurrentSearches: positive(process.env.MEDIA_MAX_CONCURRENT_SEARCHES, 2),
  searchCacheMs: positive(process.env.MEDIA_SEARCH_CACHE_MINUTES, 30) * 60 * 1000,
  ytDlpCookiesFile: process.env.MEDIA_YTDLP_COOKIES_FILE || "",
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || "",
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || ""
};
