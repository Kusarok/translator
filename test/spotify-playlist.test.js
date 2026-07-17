import test from "node:test";
import assert from "node:assert/strict";
import { parseSpotifyPlaylistUrl } from "../services/media-worker/adapters/spotify-playlist.js";

test("parses canonical and localized Spotify playlist links", () => {
  const id = "3cEYpjA9oz9GiPac4AsH4n";
  assert.equal(parseSpotifyPlaylistUrl(`https://open.spotify.com/playlist/${id}?si=x`).id, id);
  assert.equal(parseSpotifyPlaylistUrl(`https://open.spotify.com/intl-de/playlist/${id}`).url, `https://open.spotify.com/playlist/${id}`);
  assert.throws(() => parseSpotifyPlaylistUrl("https://open.spotify.com/album/not-a-playlist"));
});
