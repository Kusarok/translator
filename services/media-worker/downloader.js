import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { runProcess } from "./process-runner.js";
import { findLargestFile } from "./storage.js";

const moduleCommand = (module, args) => ({ command: config.python, args: ["-m", module, ...args] });

const ytDlpAuthArgs = () => config.ytDlpCookiesFile ? ["--cookies", config.ytDlpCookiesFile] : [];

const requirePython = () => {
  if (!fs.existsSync(config.python)) {
    throw new Error("Media tools are not installed. Run npm run media:install on the server.");
  }
};

export const capabilities = () => ({
  python: fs.existsSync(config.python),
  ytDlp: fs.existsSync(config.python),
  spotDl: fs.existsSync(config.python),
  ffmpeg: true
});

export const inspectWithYtDlp = async (url) => {
  requirePython();
  const { command, args } = moduleCommand("yt_dlp", [
    "--dump-single-json", "--no-playlist", "--no-warnings", "--socket-timeout", "20",
    ...ytDlpAuthArgs(), url
  ]);
  const { stdout } = await runProcess({ command, args, timeoutMs: Math.min(config.timeoutMs, 120000) });
  const raw = JSON.parse(stdout);
  const duration = Number(raw.duration) || null;
  if (duration && duration > config.maxDurationSeconds) {
    throw new Error(`Media is longer than the ${Math.round(config.maxDurationSeconds / 60)} minute limit.`);
  }
  return {
    title: String(raw.title || raw.fulltitle || "Untitled media"),
    creator: String(raw.uploader || raw.channel || raw.creator || ""),
    duration,
    thumbnail: String(raw.thumbnail || ""),
    sourceId: String(raw.id || ""),
    webpageUrl: String(raw.webpage_url || url),
    kind: raw.vcodec === "none" ? "audio" : "video"
  };
};

export const downloadWithYtDlp = async ({ url, directory, onProgress }) => {
  requirePython();
  const output = path.join(directory, "%(title).120B [%(id)s].%(ext)s");
  const { command, args } = moduleCommand("yt_dlp", [
    "--no-playlist", "--newline", "--no-warnings", "--socket-timeout", "30",
    "--max-filesize", String(config.maxBytes),
    "--merge-output-format", "mp4",
    "--format", "bv*[vcodec^=avc1][height<=1080]+ba[ext=m4a]/b[ext=mp4]/best[height<=1080]/best",
    "--progress-template", "download:__PROGRESS__:%(progress.downloaded_bytes)s:%(progress.total_bytes_estimate)s",
    "--output", output, ...ytDlpAuthArgs(),
    url
  ]);
  await runProcess({
    command, args, timeoutMs: config.timeoutMs,
    onLine: (line) => {
      const match = /^__PROGRESS__:(\d+|NA):(\d+|NA)/.exec(line.trim());
      if (!match) return;
      const downloaded = Number(match[1]);
      const total = Number(match[2]);
      if (Number.isFinite(downloaded) && Number.isFinite(total) && total > 0) {
        onProgress(Math.min(95, Math.max(1, Math.round((downloaded / total) * 95))));
      }
    }
  });
  return findLargestFile(directory);
};

export const downloadWithSpotDl = async ({ url, directory, onProgress }) => {
  requirePython();
  const output = path.join(directory, "{title}.{output-ext}");
  const spotifyAuthArgs = config.spotifyClientId && config.spotifyClientSecret
    ? ["--use-official-api", "--client-id", config.spotifyClientId, "--client-secret", config.spotifyClientSecret]
    : [];
  const { command, args } = moduleCommand("spotdl", [
    "download", url, "--format", "mp3", "--restrict", "strict", "--output", output, ...spotifyAuthArgs
  ]);
  onProgress(10);
  await runProcess({ command, args, timeoutMs: config.timeoutMs });
  onProgress(95);
  return findLargestFile(directory);
};
