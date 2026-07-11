import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 18090 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
let child;

const waitForHealth = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("test media worker did not start");
};

test.before(async () => {
  child = spawn(process.execPath, ["services/media-worker/server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, MEDIA_WORKER_PORT: String(port), MEDIA_STORAGE_DIR: `/tmp/translator-media-test-${port}` },
    stdio: "ignore"
  });
  await waitForHealth();
});

test.after(() => child?.kill("SIGTERM"));

test("health describes all platform adapters", async () => {
  const response = await fetch(`${base}/health`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.platforms.length, 6);
  assert.ok(data.platforms.some((entry) => entry.id === "spotify" && entry.engine === "spotdl"));
});

test("job endpoint rejects unsupported hosts", async () => {
  const response = await fetch(`${base}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/file.mp4" })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Supported platforms/);
});

test("unknown jobs and media return 404", async () => {
  const job = await fetch(`${base}/jobs/00000000-0000-0000-0000-000000000000`);
  assert.equal(job.status, 404);
  const media = await fetch(`${base}/media/00000000-0000-0000-0000-000000000000/stream`);
  assert.equal(media.status, 404);
});
