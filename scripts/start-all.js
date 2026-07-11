import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const children = [];
let stopping = false;

const start = (label, entry) => {
  const child = spawn(process.execPath, [entry], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (stopping) return;
    console.error(`${label} exited (${signal || code || 0})`);
    shutdown(code || 1);
  });
};

const shutdown = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(code);
  }, 3000).unref();
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// The media worker is managed by systemd (media-worker.service) and runs inside
// the vpnns network namespace so all downloader traffic goes through the VPN.
// If systemd is unavailable (e.g. local dev), start the media worker directly.
const isMediaWorkerRunning = () => {
  try {
    const result = spawnSync("systemctl", ["is-active", "--quiet", "media-worker"]);
    return result.status === 0;
  } catch {
    return false;
  }
};

if (!isMediaWorkerRunning()) {
  console.log("media-worker.service is not running via systemd; starting it directly (no VPN namespace).");
  start("media-worker", "services/media-worker/server.js");
} else {
  console.log("media-worker.service is active via systemd (VPN namespace).");
}

start("web", "src/server/index.js");
