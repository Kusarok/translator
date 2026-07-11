import { addLibraryPlaylistTrack, artworkStream, createLibraryPlaylist, createMediaJob, createSearchMediaJob, getLibrary, getLibraryPlaylist, getMediaJob, mediaHealth, mediaStream, openCachedTrack, removeMedia, saveTrackProgress } from "../services/media-worker.service.js";
import { findSpotifyLyrics, translateLyrics } from "../services/lyrics.service.js";
import { isOwnerAuthenticated } from "../services/auth.service.js";
import { env } from "../config/env.js";
import { completeSpotifyConnection, importConnectedSpotifyPlaylist, spotifyConnectUrl } from "../services/spotify-account.service.js";

export const health = async (_req, res) => {
  const result = await mediaHealth();
  res.status(result.status).json(result.data);
};

export const createJob = async (req, res) => {
  const result = await createMediaJob(req.body?.url);
  res.status(result.status).json(result.data);
};

export const createSearchJob = async (req, res) => {
  const result = await createSearchMediaJob(req.body?.query, req.body?.referenceUrl);
  res.status(result.status).json(result.data);
};

export const getJob = async (req, res) => {
  const result = await getMediaJob(req.params.id);
  res.status(result.status).json(result.data);
};

export const deleteMedia = async (req, res) => {
  const result = await removeMedia(req.params.id);
  res.status(result.status).json(result.data);
};

export const streamMedia = (kind) => async (req, res) => {
  const upstream = await mediaStream(req.params.id, kind, req.headers.range);
  res.status(upstream.statusCode || 200);
  for (const header of ["content-type", "content-length", "content-range", "accept-ranges", "content-disposition", "cache-control"]) {
    if (upstream.headers[header]) res.set(header, upstream.headers[header]);
  }
  upstream.on("error", () => res.destroy());
  upstream.pipe(res);
};

export const streamArtwork = async (req, res) => {
  const upstream = await artworkStream(req.params.id);
  res.status(upstream.statusCode || 200);
  for (const header of ["content-type", "content-length", "cache-control"]) {
    if (upstream.headers[header]) res.set(header, upstream.headers[header]);
  }
  upstream.on("error", () => res.destroy());
  upstream.pipe(res);
};

export const getLyrics = async (req, res) => res.json(await findSpotifyLyrics(req.body?.url));

export const translateSyncedLyrics = async (req, res) => res.json(await translateLyrics({
  ...req.body,
  authenticated: isOwnerAuthenticated(req)
}));

const relay = (result, res) => res.status(result.status).json(result.data);
export const library = async (_req, res) => {
  const result = await getLibrary();
  result.data.spotify.configured = Boolean(env.spotifyClientId && env.spotifyClientSecret && env.spotifyRedirectUri);
  relay(result, res);
};
export const createPlaylist = async (req, res) => relay(await createLibraryPlaylist(req.body), res);
export const playlist = async (req, res) => relay(await getLibraryPlaylist(req.params.id), res);
export const addPlaylistTrack = async (req, res) => relay(await addLibraryPlaylistTrack(req.params.id, req.body), res);
export const openTrack = async (req, res) => relay(await openCachedTrack(req.params.id), res);
export const trackProgress = async (req, res) => relay(await saveTrackProgress(req.params.id, req.body), res);
export const spotifyConnect = async (_req, res) => res.redirect(spotifyConnectUrl());
export const spotifyCallback = async (req, res) => {
  await completeSpotifyConnection({ code: req.query.code, state: req.query.state });
  res.redirect("/?spotify=connected");
};
export const spotifyImportPlaylist = async (req, res) => res.json(await importConnectedSpotifyPlaylist(req.body?.url));
