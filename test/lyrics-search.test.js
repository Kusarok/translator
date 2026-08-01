import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSearchText, validateSearchQuery } from "../services/media-worker/modules/search/query-normalizer.js";
import { dedupeCandidates, matchedLyricLine, rankCandidate } from "../services/media-worker/modules/search/result-ranker.js";
import { fetchLrclibSearch } from "../services/media-worker/modules/search/lrclib.provider.js";

test("normalizes lyric queries and validates their bounds", () => {
  assert.equal(normalizeSearchText("I’ve  SEEN trouble!"), "i've seen trouble");
  assert.throws(() => validateSearchQuery("x"));
  assert.equal(validateSearchQuery("constant sorrow").normalized, "constant sorrow");
});

test("requires duration and metadata agreement before accepting playable audio", () => {
  const candidate = { trackName: "How You Remind Me", artistName: "Nickelback", duration: 224,
    syncedLyrics: "[00:01.00]Never made it as a wise man\n[00:04.00]I couldn't cut it" };
  const accepted = rankCandidate({ candidate, audio: { title: "Nickelback - How You Remind Me (Audio)", creator: "Nickelback", duration: 224 }, query: "wise man" });
  assert.ok(accepted.score > 0);
  assert.equal(accepted.lyricMatch, "Never made it as a wise man");
  assert.equal(rankCandidate({ candidate, audio: { title: "Cover", creator: "Other", duration: 180 }, query: "wise man" }), null);
});

test("deduplicates identical lyric versions", () => {
  const rows = [{ trackName: "Song", artistName: "Artist", duration: 200 }, { trackName: "song", artistName: "artist", duration: 201 }];
  assert.equal(dedupeCandidates(rows).length, 1);
  assert.equal(matchedLyricLine("[00:01]Hello from the other side", "other side"), "Hello from the other side");
});

test("retries transient LRCLIB failures before returning results", async () => {
  let calls = 0;
  const rows = await fetchLrclibSearch("garth brooks", {
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error("temporary timeout"), { name: "TimeoutError" });
      return { ok: true, json: async () => [{ id: 1, artistName: "Garth Brooks" }] };
    },
    pause: async () => {}
  });
  assert.equal(calls, 3);
  assert.equal(rows[0].artistName, "Garth Brooks");
});

test("does not retry permanent LRCLIB client errors", async () => {
  let calls = 0;
  await assert.rejects(fetchLrclibSearch("garth brooks", {
    fetchImpl: async () => { calls += 1; return { ok: false, status: 400 }; },
    pause: async () => {}
  }), /HTTP 400/);
  assert.equal(calls, 1);
});

test("reports a clear error after LRCLIB retries are exhausted", async () => {
  await assert.rejects(fetchLrclibSearch("garth brooks", {
    fetchImpl: async () => { throw Object.assign(new Error("temporary timeout"), { name: "TimeoutError" }); },
    maxAttempts: 2,
    pause: async () => {}
  }), /timed out after 2 attempts/);
});
