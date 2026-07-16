import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { repositories } from "../persistence.js";
import { getCachedLessonByTrackId } from "./lesson-cache.service.js";

const artworkUrl = (row) => row.artwork_id ? `/api/media/artwork/${row.artwork_id}` : row.artwork_url || "";
const trackView = (row) => ({
  id: row.id,
  spotifyId: row.external_id,
  sourceUrl: row.source_url,
  title: row.title,
  artist: row.artist,
  album: row.album,
  duration: row.duration_seconds,
  artwork: artworkUrl(row),
  mediaId: row.media_id || null,
  ready: Boolean(row.media_id),
  learningStatus: row.learning_status || "new",
  completionPercent: Number(row.completion_percent || 0),
  lastOpenedAt: row.last_opened_at || null
});

const playlistView = (row) => ({
  id: row.id, source: row.source, externalId: row.external_id, name: row.name,
  description: row.description, sourceUrl: row.source_url,
  artwork: row.artwork_url || (row.first_artwork_id ? `/api/media/artwork/${row.first_artwork_id}` : row.first_artwork_url || ""),
  trackCount: Number(row.track_count || 0), updatedAt: row.updated_at, lastSyncedAt: row.last_synced_at
});

export const libraryOverview = (userId) => ({
  continueLearning: repositories.library.continueLearning(userId).map(trackView),
  recent: repositories.library.recent(userId).map(trackView),
  playlists: repositories.playlists.list(userId).map(playlistView),
  artists: repositories.artists.list(userId).map((row) => ({
    id: row.id, name: row.name, status: row.scan_status, discoveredCount: row.discovered_count,
    learnableCount: row.learnable_count, artwork: row.artwork_id ? `/api/media/artwork/${row.artwork_id}` : row.artwork_url || ""
  })),
  quota: repositories.quota.status(userId, config.dailyNewSongLimit),
  spotify: { connected: Boolean(repositories.spotifyAccounts.current(userId)), configured: Boolean(config.spotifyClientId && config.spotifyClientSecret) }
});

export const createLearningPlaylist = (userId, payload) => playlistView(repositories.playlists.create({
  userId,
  source: "local", name: String(payload?.name || "").trim() || "New playlist",
  description: String(payload?.description || "").trim()
}));

export const importSpotifyPlaylist = (userId, payload) => {
  if (!payload?.spotifyId || !Array.isArray(payload.tracks)) throw new TypeError("Spotify playlist metadata and tracks are required.");
  const playlist = repositories.playlists.upsertExternal({
    userId,
    source: "spotify", externalId: payload.spotifyId, name: payload.name || "Spotify playlist",
    description: payload.description || "", sourceUrl: payload.sourceUrl, artworkUrl: payload.artwork,
    snapshotId: payload.snapshotId, lastSyncedAt: new Date().toISOString()
  });
  payload.tracks.forEach((item, position) => {
    const track = repositories.tracks.upsert({ source: "spotify", externalId: item.spotifyId,
      sourceUrl: item.sourceUrl, title: item.title, artist: item.artist, album: item.album,
      durationSeconds: item.duration, artworkUrl: item.artwork });
    repositories.playlists.addTrack(playlist.id, track.id, item.position ?? position);
  });
  return getPlaylistDetail(userId, playlist.id);
};

export const getPlaylistDetail = (userId, id) => {
  const playlist = repositories.playlists.findById(id, userId);
  if (!playlist) return null;
  return { ...playlistView(playlist), tracks: repositories.playlists.tracks(id, userId).map(trackView) };
};

export const updateLearningPlaylist = (userId, id, payload) => {
  const playlist = repositories.playlists.update(id, payload, userId);
  return playlist ? getPlaylistDetail(userId, id) : null;
};

export const deleteLearningPlaylist = (userId, id) => repositories.playlists.delete(id, userId);

export const removeTrackFromPlaylist = (userId, playlistId, trackId) => repositories.playlists.findById(playlistId, userId) && repositories.playlists.removeTrack(playlistId, trackId);

export const addTrackToPlaylist = (userId, playlistId, payload) => {
  const playlist = repositories.playlists.findById(playlistId, userId);
  if (!playlist) return null;
  const track = payload.trackId
    ? repositories.tracks.findById(payload.trackId)
    : repositories.tracks.findByExternalId("spotify", payload.spotifyId);
  if (!track) throw new Error("Prepare this song before adding it to a playlist.");
  repositories.library.save(userId, track.id);
  repositories.playlists.addTrack(playlistId, track.id, repositories.playlists.tracks(playlistId, userId).length);
  return getPlaylistDetail(userId, playlistId);
};

export const openLibraryTrack = (userId, trackId) => {
  const track = repositories.tracks.findById(trackId);
  if (!track) return null;
  repositories.library.save(userId, track.id);
  repositories.library.touchProgress(userId, track.id, { status: "learning", incrementOpen: true });
  return getCachedLessonByTrackId(track.id);
};

export const updateTrackProgress = (userId, trackId, payload) => {
  const track = repositories.tracks.findById(trackId);
  if (!track) return null;
  repositories.library.save(userId, track.id);
  repositories.library.touchProgress(userId, trackId, payload);
  return { ok: true };
};

export const libraryStorageInfo = () => {
  let bytes = 0;
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target); else bytes += fs.statSync(target).size;
    }
  };
  visit(config.storageDir);
  return { bytes };
};
