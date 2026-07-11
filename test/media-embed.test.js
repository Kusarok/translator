import test from "node:test";
import assert from "node:assert/strict";
import { buildMediaEmbed } from "../src/client/assets/js/media-embed.js";

test("builds an embed for a Spotify track", () => {
  const spotify = buildMediaEmbed("https://open.spotify.com/track/0gmbgwZ8iqyMPmXefof8Yf?si=HhnrYlY5TgaNJ88mD73BqA&utm_source=copy-link");
  assert.equal(spotify.embedUrl, "https://open.spotify.com/embed/track/0gmbgwZ8iqyMPmXefof8Yf");
  assert.equal(spotify.layout, "spotify-compact");
});

test("Learn accepts only Spotify track links", () => {
  assert.equal(buildMediaEmbed("https://open.spotify.com/intl-de/track/0gmbgwZ8iqyMPmXefof8Yf").platform, "spotify");
  for (const url of [
    "https://www.youtube.com/shorts/r30Q7xbooYs",
    "https://open.spotify.com/album/6JWc4iAiJ9FjyK0B59ABb4",
    "https://www.tiktok.com/@user/video/7462380410450000000"
  ]) assert.throws(() => buildMediaEmbed(url), /mediaUnsupported/);
});

test("rejects unsafe, unsupported, and malformed media links", () => {
  for (const url of [
    "file:///etc/passwd",
    "https://user:pass@youtube.com/watch?v=r30Q7xbooYs",
    "https://youtube.com.attacker.example/watch?v=r30Q7xbooYs",
    "https://youtube.com:444/watch?v=r30Q7xbooYs",
    "https://www.youtube.com/playlist?list=PL123",
    "https://www.instagram.com/example/",
    "https://open.spotify.com/track/not-an-id"
  ]) {
    assert.throws(() => buildMediaEmbed(url), /media(?:InvalidUrl|UnsupportedUrl|UnsupportedContent)/);
  }
});
