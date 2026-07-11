import { spawn } from "node:child_process";
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

start("media-worker", "services/media-worker/server.js");
start("web", "src/server/index.js");
