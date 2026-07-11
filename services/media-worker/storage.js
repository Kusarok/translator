import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";

fs.mkdirSync(config.storageDir, { recursive: true });

export const createStorageTarget = () => {
  const id = crypto.randomUUID();
  const directory = path.join(config.storageDir, id);
  fs.mkdirSync(directory, { recursive: true });
  return { id, directory };
};

export const safeMediaPath = (media) => {
  if (!media?.filePath) return null;
  const resolved = path.resolve(media.filePath);
  const root = `${path.resolve(config.storageDir)}${path.sep}`;
  return resolved.startsWith(root) ? resolved : null;
};

export const findLargestFile = (directory) => {
  const files = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.endsWith(".part") && !entry.name.endsWith(".ytdl"))
    .map((entry) => {
      const filePath = path.join(directory, entry.name);
      return { filePath, stat: fs.statSync(filePath) };
    })
    .filter(({ stat }) => stat.size > 0)
    .sort((a, b) => b.stat.size - a.stat.size);
  return files[0] || null;
};

export const removeDirectory = (directory) => {
  if (!directory) return;
  const resolved = path.resolve(directory);
  const root = `${path.resolve(config.storageDir)}${path.sep}`;
  if (resolved.startsWith(root)) fs.rmSync(resolved, { recursive: true, force: true });
};
