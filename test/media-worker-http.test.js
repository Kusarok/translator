import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../services/media-worker/database/index.js";
import { createRepositories } from "../services/media-worker/repositories/index.js";

const port = 18090 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const root = fs.mkdtempSync(path.join(os.tmpdir(), "translator-worker-http-"));
const mediaId = "med_range_fixture";
const mediaBytes = Buffer.from("0123456789abcdef", "utf8");
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

const startWorker = async () => {
  child = spawn(process.execPath, ["services/media-worker/server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, MEDIA_WORKER_PORT: String(port), MEDIA_DATA_DIR: root },
    stdio: "ignore"
  });
  await waitForHealth();
};

const stopWorker = async () => {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
};

test.before(async () => {
  const relativePath = `media/${mediaId}/fixture.mp3`;
  fs.mkdirSync(path.join(root, path.dirname(relativePath)), { recursive: true });
  fs.writeFileSync(path.join(root, relativePath), mediaBytes);
  const db = openDatabase({ storageRoot: root });
  const repo = createRepositories(db);
  const track = repo.tracks.upsert({ source: "fixture", externalId: "range-track", title: "Range track", artist: "Test" });
  repo.media.upsert({ id: mediaId, trackId: track.id, provider: "fixture", providerMediaId: "range-media",
    relativePath, mimeType: "audio/mpeg", sizeBytes: mediaBytes.length, status: "ready" });
  db.close();
  await startWorker();
});

test.after(async () => {
  await stopWorker();
  fs.rmSync(root, { recursive: true, force: true });
});

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
    headers: { "Content-Type": "application/json", "X-Translator-User-Id": "usr_test" },
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

test("cached media supports byte ranges without sending the whole file", async () => {
  const response = await fetch(`${base}/media/${mediaId}/stream`, { headers: { Range: "bytes=3-7" } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("content-range"), `bytes 3-7/${mediaBytes.length}`);
  assert.equal(response.headers.get("content-length"), "5");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), mediaBytes.subarray(3, 8));
});

test("full cached media response advertises the player streaming contract", async () => {
  const response = await fetch(`${base}/media/${mediaId}/stream`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.equal(response.headers.get("content-length"), String(mediaBytes.length));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), mediaBytes);
});

test("cached media supports suffix ranges used by mobile audio players", async () => {
  const response = await fetch(`${base}/media/${mediaId}/stream`, { headers: { Range: "bytes=-4" } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), `bytes 12-15/${mediaBytes.length}`);
  assert.equal(response.headers.get("content-length"), "4");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), mediaBytes.subarray(-4));
});

test("cached media rejects ranges beyond the end of the file", async () => {
  const response = await fetch(`${base}/media/${mediaId}/stream`, { headers: { Range: "bytes=99-120" } });
  assert.equal(response.status, 416);
  assert.equal(response.headers.get("content-range"), `bytes */${mediaBytes.length}`);
});

test("cached media rejects malformed and multiple ranges", async () => {
  for (const range of ["bytes=-0", "bytes=-", "bytes=0-1,4-5"]) {
    const response = await fetch(`${base}/media/${mediaId}/stream`, { headers: { Range: range } });
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get("content-range"), `bytes */${mediaBytes.length}`);
  }
});

test("cached media remains streamable after the worker restarts", async () => {
  await stopWorker();
  await startWorker();
  const response = await fetch(`${base}/media/${mediaId}/stream`);
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), mediaBytes);
});
