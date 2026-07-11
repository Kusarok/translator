import test from "node:test";
import assert from "node:assert/strict";
import { parseLrc } from "../src/server/services/lyrics.service.js";

test("parses, sorts and preserves synchronized LRC lines", () => {
  assert.deepEqual(parseLrc("[00:12.50] Hello\n[00:02.1][00:04.10] Intro\n[ar:Someone]"), [
    { time: 2.1, text: "Intro" },
    { time: 4.1, text: "Intro" },
    { time: 12.5, text: "Hello" }
  ]);
});
