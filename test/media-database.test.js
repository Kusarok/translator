import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase, databasePath } from "../services/media-worker/database/index.js";
import { createRepositories } from "../services/media-worker/repositories/index.js";

test("database lives under the injected storage root and migrations are idempotent", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "translator-db-"));
  const db = openDatabase({ storageRoot: root });
  assert.equal(databasePath(root), path.join(root, "database", "translator.sqlite"));
  assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  assert.equal(db.prepare("SELECT count(*) AS count FROM schema_migrations").get().count, 4);
  db.close();
  openDatabase({ storageRoot: root }).close();
  fs.rmSync(root, { recursive: true, force: true });
});

test("repositories cache entities with independent prefixed ids and relative paths", () => {
  const db = openDatabase({ filename: ":memory:" });
  const repo = createRepositories(db);
  const track = repo.tracks.upsert({ source: "spotify", externalId: "abc", sourceUrl: "https://open.spotify.com/track/abc", title: "Song", artist: "Artist" });
  assert.match(track.id, /^trk_/);
  assert.equal(repo.tracks.upsert({ source: "spotify", externalId: "abc", title: "New title" }).id, track.id);
  const lyrics = repo.lyrics.upsert({ trackId: track.id, source: "lrclib", externalId: "42", contentHash: "hash", relativePath: "lyrics/lyr_x/original.json" });
  const translation = repo.translations.upsert({ lyricsId: lyrics.id, targetLanguage: "fa", provider: "openai", model: "model", promptVersion: "1", contentHash: "trhash", relativePath: "translations/trn_x/fa.json" });
  const media = repo.media.upsert({ trackId: track.id, provider: "youtube", providerMediaId: "yt1", relativePath: "media/med_x/audio.mp3", sizeBytes: 10 });
  const artwork = repo.artwork.upsert({ trackId: track.id, remoteUrl: "https://example.com/cover.jpg", relativePath: "artwork/art_x/cover.jpg", sizeBytes: 10 });
  const job = repo.jobs.create({ trackId: track.id, jobType: "audio" });
  const playlist = repo.playlists.create({ name: "Learning mix" });
  repo.playlists.addTrack(playlist.id, track.id, 0);
  assert.match(lyrics.id, /^lyr_/);
  assert.match(translation.id, /^trn_/);
  assert.match(media.id, /^med_/);
  assert.match(artwork.id, /^art_/);
  assert.match(job.id, /^job_/);
  assert.match(playlist.id, /^pls_/);
  assert.equal(repo.playlists.tracks(playlist.id).length, 1);
  repo.library.touchProgress(track.id, { status: "learning", playbackSeconds: 12, completionPercent: 20, incrementOpen: true });
  assert.equal(repo.library.continueLearning(1)[0].id, track.id);
  assert.equal(repo.library.recent(1)[0].completion_percent, 20);
  const account = repo.spotifyAccounts.upsert({ spotifyUserId: "user1", displayName: "User", accessTokenCiphertext: "cipher1", refreshTokenCiphertext: "cipher2", scopes: "playlist-read-private", expiresAt: new Date().toISOString() });
  assert.match(account.id, /^spa_/);
  assert.equal(path.isAbsolute(media.relative_path), false);
  assert.equal(repo.jobs.findActive(track.id, "audio").id, job.id);
  assert.equal(repo.jobs.update(job.id, { status: "completed", resultId: media.id }).status, "completed");
  db.close();
});
