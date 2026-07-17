import test from "node:test";
import assert from "node:assert/strict";
import { friendlyMediaError } from "../services/media-worker/jobs.js";

test("explains YouTube bot verification failures", () => {
  const result = friendlyMediaError(
    new Error("ERROR: Sign in to confirm you’re not a bot"),
    { id: "youtube" }
  );
  assert.match(result, /MEDIA_YTDLP_COOKIES_FILE/);
});

test("explains Spotify metadata hash failures", () => {
  const result = friendlyMediaError(
    new Error("BaseClientError: Could not get general hashes"),
    { id: "spotify" }
  );
  assert.match(result, /VPN|YouTube Music API|temporarily unavailable/);
});

test("preserves unrelated extractor errors", () => {
  assert.equal(
    friendlyMediaError(new Error("The video is private"), { id: "instagram" }),
    "The video is private"
  );
});
