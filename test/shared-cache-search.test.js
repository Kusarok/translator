import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("lyrics search completes immediately when a playable shared track is cached", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "translator-shared-search-"));
  process.env.MEDIA_DATA_DIR = root;

  const [{ cacheTrackLyrics }, { createLyricsSearch }, { repositories, database }] = await Promise.all([
    import("../services/media-worker/services/lesson-cache.service.js"),
    import("../services/media-worker/modules/search/search.service.js"),
    import("../services/media-worker/persistence.js")
  ]);

  const ids = await cacheTrackLyrics({
    lrclibId: 991001,
    title: "Already Here",
    artist: "Shared Artist",
    album: "Shared Cache",
    duration: 180,
    lines: [{ time: 1, text: "a line already stored for everyone" }]
  });
  const relativePath = "media/shared/audio.m4a";
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, "cached-audio");
  repositories.media.upsert({
    trackId: ids.trackId,
    provider: "youtube",
    providerMediaId: "shared-search-audio",
    relativePath,
    mimeType: "audio/mp4",
    status: "ready"
  });

  const result = createLyricsSearch("Shared Artist");
  assert.equal(result.status, "completed");
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].trackId, ids.trackId);
  assert.equal(result.results[0].cached, true);

  database.close();
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.MEDIA_DATA_DIR;
});
