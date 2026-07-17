import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../services/media-worker/database/index.js";
import { createRepositories } from "../services/media-worker/repositories/index.js";

const temporaryDatabase = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "translator-regression-"));
  const db = openDatabase({ storageRoot: root });
  return { root, db, repo: createRepositories(db) };
};

const closeAndRemove = ({ root, db }) => {
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
};

test("artist catalog exposes only audio-verified or ready tracks", () => {
  const fixture = temporaryDatabase();
  const { repo } = fixture;
  const artist = repo.artists.upsert({ musicbrainzId: "artist-eligibility", name: "Eligible Artist" });
  const checking = repo.artists.addCatalogItem({ artistId: artist.id, lrclibId: 101, title: "Checking", syncedLyrics: "[00:01]line" });
  const unavailable = repo.artists.addCatalogItem({ artistId: artist.id, lrclibId: 102, title: "Unavailable", syncedLyrics: "[00:01]line" });
  const verified = repo.artists.addCatalogItem({ artistId: artist.id, lrclibId: 103, title: "Verified", syncedLyrics: "[00:01]line" });

  repo.artists.setVerification(unavailable.id, { status: "unavailable" });
  repo.artists.setVerification(verified.id, { status: "verified", audioProviderId: "youtube-103",
    audioWebpageUrl: "https://www.youtube.com/watch?v=youtube-103", audioDurationSeconds: 180 });

  assert.deepEqual(repo.artists.catalog(artist.id).map((row) => row.id), [verified.id]);
  assert.equal(repo.artists.catalogItem(checking.id).status, "checking");
  closeAndRemove(fixture);
});

test("artist catalog reuses stable rows, verified search audio, and cached tracks", () => {
  const fixture = temporaryDatabase();
  const { repo } = fixture;
  const artist = repo.artists.upsert({ musicbrainzId: "artist-cache", name: "Cache Artist" });
  const first = repo.artists.addCatalogItem({ artistId: artist.id, lrclibId: 201, title: "Song", syncedLyrics: "[00:01]first" });
  const second = repo.artists.addCatalogItem({ artistId: artist.id, lrclibId: 201, title: "Song", syncedLyrics: "[00:01]updated" });
  assert.equal(second.id, first.id, "rescans must update the existing catalog row");

  const search = repo.search.createJob("Cache Artist Song", "cache artist song");
  repo.search.addResult({ searchJobId: search.id, lrclibId: 201, title: "Song", artist: "Cache Artist",
    syncedLyrics: "[00:01]updated", audioProviderId: "youtube-201", audioWebpageUrl: "https://youtu.be/youtube-201",
    audioDurationSeconds: 181, status: "ready" });
  assert.equal(repo.search.findVerifiedByLrclibId(201).audio_provider_id, "youtube-201");

  const track = repo.tracks.upsert({ source: "lrclib", externalId: "201", title: "Song", artist: "Cache Artist" });
  repo.artists.setTrack(first.id, track.id);
  const catalog = repo.artists.catalog(artist.id);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].track_id, track.id);
  assert.equal(catalog[0].status, "ready");
  closeAndRemove(fixture);
});

test("playlist CRUD is idempotent and deleting a playlist preserves library tracks", () => {
  const fixture = temporaryDatabase();
  const { repo } = fixture;
  const track = repo.tracks.upsert({ source: "lrclib", externalId: "playlist-track", title: "Song", artist: "Artist" });
  const playlist = repo.playlists.create({ name: "Original", description: "Before" });
  repo.playlists.addTrack(playlist.id, track.id, 0);
  repo.playlists.addTrack(playlist.id, track.id, 4);
  assert.equal(repo.playlists.tracks(playlist.id).length, 1, "adding the same song twice must not duplicate it");
  assert.equal(repo.playlists.tracks(playlist.id)[0].position, 4);

  const updated = repo.playlists.update(playlist.id, { name: "Renamed", description: "After" });
  assert.equal(updated.name, "Renamed");
  assert.equal(updated.description, "After");
  assert.equal(repo.playlists.removeTrack(playlist.id, track.id), true);
  assert.equal(repo.playlists.removeTrack(playlist.id, track.id), false);
  repo.playlists.addTrack(playlist.id, track.id, 0);
  assert.equal(repo.playlists.delete(playlist.id), true);
  assert.equal(repo.playlists.delete(playlist.id), false);
  assert.equal(repo.tracks.findById(track.id).title, "Song");
  closeAndRemove(fixture);
});

test("library, recent activity, artists, playlists, and daily quota are isolated per user", () => {
  const fixture = temporaryDatabase();
  const { repo } = fixture;
  const alice = "usr_alice", bob = "usr_bob";
  const track = repo.tracks.upsert({ source: "lrclib", externalId: "shared-cache", title: "Shared", artist: "Artist" });
  const artist = repo.artists.upsert({ musicbrainzId: "shared-artist", name: "Artist" });
  repo.library.save(alice, track.id);
  repo.library.touchProgress(alice, track.id, { status: "learning", playbackSeconds: 10, incrementOpen: true });
  repo.artists.addForUser(alice, artist.id);
  const playlist = repo.playlists.create({ userId: alice, name: "Alice mix" });
  repo.playlists.addTrack(playlist.id, track.id, 0);

  assert.equal(repo.library.recent(alice).length, 1);
  assert.equal(repo.library.recent(bob).length, 0);
  assert.equal(repo.artists.list(alice).length, 1);
  assert.equal(repo.artists.list(bob).length, 0);
  assert.equal(repo.playlists.list(alice).length, 1);
  assert.equal(repo.playlists.list(bob).length, 0);
  assert.equal(repo.playlists.findById(playlist.id, bob), null);

  for (let index = 0; index < 5; index += 1) assert.ok(repo.quota.consume(alice, `track:${index}`, 5));
  assert.equal(repo.quota.consume(alice, "track:5", 5), null);
  assert.equal(repo.quota.consume(alice, "track:0", 5).remaining, 0, "the same song must not consume quota twice");
  assert.equal(repo.quota.status(bob, 5).remaining, 5);
  closeAndRemove(fixture);
});

test("ready songs form a shared catalog while activity stays private", () => {
  const fixture = temporaryDatabase();
  const { repo } = fixture;
  const alice = "usr_alice", bob = "usr_bob";
  const track = repo.tracks.upsert({ source: "lrclib", externalId: "global-song", title: "Global Song", artist: "Shared Artist" });
  const lyrics = repo.lyrics.upsert({ trackId: track.id, source: "lrclib", externalId: "global-lyrics", contentHash: "global-hash", relativePath: "lyrics/global/song.json" });
  repo.media.upsert({ trackId: track.id, provider: "youtube", providerMediaId: "global-media", relativePath: "media/global/song.m4a", status: "ready" });
  repo.search.indexLyrics({ trackId: track.id, lyricsId: lyrics.id, title: track.title, artist: track.artist, album: "", lyrics: "a lyric everyone can find" });
  repo.library.save(alice, track.id);

  assert.equal(repo.library.recent(alice).length, 1);
  assert.equal(repo.library.recent(bob).length, 0, "another user's listening activity must stay private");
  assert.equal(repo.library.catalog(alice).map((item) => item.id).includes(track.id), true);
  assert.equal(repo.library.catalog(bob).map((item) => item.id).includes(track.id), true, "ready cached music must be available to every user");
  assert.equal(repo.search.local('"shared artist"', 10)[0].track_id, track.id, "shared cache search must not be scoped to one user");
  closeAndRemove(fixture);
});

test("search jobs deduplicate active queries, cache completed results, and survive restart", () => {
  const fixture = temporaryDatabase();
  const { root, repo } = fixture;
  const active = repo.search.createJob("  Johnny CASH ", "johnny cash");
  assert.equal(repo.search.findActive("johnny cash").id, active.id);
  assert.equal(repo.search.recoverable().map((row) => row.id).includes(active.id), true);
  repo.search.updateJob(active.id, { status: "verifying", candidatesFound: 7, lyricsVerified: 7 });
  fixture.db.close();

  const reopened = openDatabase({ storageRoot: root });
  const reopenedRepo = createRepositories(reopened);
  assert.equal(reopenedRepo.search.recoverable()[0].id, active.id);
  reopenedRepo.search.updateJob(active.id, { status: "completed", audioVerified: 4 });
  assert.equal(reopenedRepo.search.findActive("johnny cash"), null);
  assert.equal(reopenedRepo.search.findCached("johnny cash", new Date(Date.now() - 60_000).toISOString()).id, active.id);
  assert.equal(reopenedRepo.search.findCached("different query", new Date(0).toISOString()), null);
  reopened.close();
  fs.rmSync(root, { recursive: true, force: true });
});
