import path from "node:path";
import { fileURLToPath } from "node:url";

const serviceDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(serviceDir, "../..");
const positive = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  host: process.env.RADIO_WORKER_HOST || "127.0.0.1",
  port: positive(process.env.RADIO_WORKER_PORT, 8091),
  storageDir: process.env.RADIO_STORAGE_DIR || path.join(rootDir, "data", "radio"),
  ffmpeg: process.env.RADIO_FFMPEG || "ffmpeg",
  staleAfterMs: positive(process.env.RADIO_STALE_SECONDS, 35) * 1000,
  segmentSeconds: positive(process.env.RADIO_SEGMENT_SECONDS, 5),
  playlistSegments: positive(process.env.RADIO_PLAYLIST_SEGMENTS, 10)
};
