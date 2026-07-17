import test from "node:test";
import assert from "node:assert/strict";
import { platformCatalog, resolvePlatform } from "../services/media-worker/adapters/platforms.js";

const cases = [
  ["https://www.youtube.com/watch?v=abc", "youtube"],
  ["https://music.youtube.com/watch?v=abc", "youtube"],
  ["https://youtu.be/abc", "youtube"],
  ["https://x.com/example/status/123", "x"],
  ["https://twitter.com/example/status/123", "x"],
  ["https://www.instagram.com/reel/example/", "instagram"],
  ["https://www.facebook.com/watch/?v=123", "facebook"],
  ["https://fb.watch/example/", "facebook"],
  ["https://open.spotify.com/track/example", "spotify"],
  ["https://www.tiktok.com/@example/video/123", "tiktok"]
];

test("classifies every requested social platform", () => {
  for (const [url, expected] of cases) assert.equal(resolvePlatform(url).id, expected, url);
  assert.deepEqual(platformCatalog().map((entry) => entry.id), ["youtube", "x", "instagram", "facebook", "spotify", "tiktok"]);
});

test("rejects unsupported, credentialed, and non-http URLs", () => {
  assert.throws(() => resolvePlatform("https://example.com/video"), /Supported platforms/);
  assert.throws(() => resolvePlatform("file:///etc/passwd"), /Only HTTP/);
  assert.throws(() => resolvePlatform("https://user:pass@youtube.com/watch?v=x"), /credentials/);
  assert.throws(() => resolvePlatform("not a url"), /valid public media URL/);
});

test("does not allow suffix-confusion domains", () => {
  assert.throws(() => resolvePlatform("https://youtube.com.attacker.example/video"), /Supported platforms/);
  assert.throws(() => resolvePlatform("https://evilyoutube.com/video"), /Supported platforms/);
});
