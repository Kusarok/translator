import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const venv = path.join(root, "services", "media-worker", ".venv");
const python = path.join(venv, "bin", "python");

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
};

if (!fs.existsSync(python)) run("python3", ["-m", "venv", venv]);
run(python, ["-m", "pip", "install", "--upgrade", "pip"]);
run(python, ["-m", "pip", "install", "yt-dlp", "spotdl"]);
