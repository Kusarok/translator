import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server/app.js";

test("allows official media embeds while keeping scripts restricted", async (t) => {
  const server = createApp().listen(0, "127.0.0.1");
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/`);
  const policy = response.headers.get("content-security-policy") || "";

  assert.equal(response.status, 200);
  assert.match(policy, /frame-src[^;]*youtube-nocookie\.com/);
  assert.match(policy, /frame-src[^;]*open\.spotify\.com/);
  assert.match(policy, /frame-src[^;]*instagram\.com/);
  assert.match(policy, /frame-src[^;]*tiktok\.com/);
  assert.match(policy, /frame-src[^;]*twitter\.com/);
  assert.match(policy, /frame-src[^;]*facebook\.com/);
  assert.match(policy, /script-src 'self'/);
  assert.match(policy, /script-src[^;]*embed-cdn\.spotifycdn\.com/);
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
});
