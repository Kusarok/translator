import test from "node:test";
import assert from "node:assert/strict";
import { createLyricsBatches, translateLyricsBatch } from "../src/server/services/lyrics.service.js";

test("lyrics batches preserve line order and stay within safe request limits", () => {
  const lines = Array.from({ length: 137 }, (_, index) => ({ index, text: `line-${index}-${"x".repeat(35)}` }));
  const batches = createLyricsBatches(lines);

  assert.ok(batches.length > 1);
  assert.deepEqual(batches.flat().map((line) => line.index), lines.map((line) => line.index));
  for (const batch of batches) {
    assert.ok(batch.length <= 20);
    assert.ok(batch.map((line) => line.text).join("\n").length <= 900);
  }
});

test("lyrics batching never separates or drops an oversized individual line", () => {
  const lines = [{ index: 0, text: "x".repeat(1000) }, { index: 1, text: "short" }];
  assert.deepEqual(createLyricsBatches(lines).flat(), lines);
});

test("a malformed model response is split until every lyric line is aligned", async () => {
  const lines = Array.from({ length: 5 }, (_, index) => ({ index, text: `source-${index}` }));
  const calls = [];
  const fakeTranslate = async ({ text }) => {
    const sourceLines = text.split("\n");
    calls.push(sourceLines.length);
    return {
      text: sourceLines.length > 2 ? "incomplete" : sourceLines.map((line) => `فارسی-${line}`).join("\n"),
      model: "test-model"
    };
  };

  const result = await translateLyricsBatch(lines, { authenticated: true }, fakeTranslate);

  assert.deepEqual(result.values, lines.map((line) => `فارسی-${line.text}`));
  assert.equal(result.model, "test-model");
  assert.deepEqual(calls, [5, 3, 2, 1, 2]);
});
