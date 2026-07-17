import { addLibraryPlaylistTrack, artworkStream, createLibraryArtist, createLibraryPlaylist, createLyricsSearchJob, createMediaJob, createSearchMediaJob, deleteLibraryPlaylist, discoverLibraryArtists, getLibrary, getLibraryArtist, getLibraryPlaylist, getLyricsSearchJob, getLyricsTranslationStatus as getCachedTranslationStatus, getMediaJob, mediaHealth, mediaStream, openCachedTrack, prepareLibraryArtistTrack, prepareLyricsSearchResult, removeLibraryPlaylistTrack, removeMedia, saveTrackProgress, updateLibraryPlaylist } from "../services/media-worker.service.js";
import { findSpotifyLyrics, translateLyrics } from "../services/lyrics.service.js";
import { isOwnerAuthenticated, readSession } from "../services/auth.service.js";
import { env } from "../config/env.js";
import { completeSpotifyConnection, importConnectedSpotifyPlaylist, spotifyConnectUrl } from "../services/spotify-account.service.js";
import { scheduleLyricsTranslationRetry } from "../services/lyrics-translation-queue.service.js";

export const health = async (_req, res) => {
  const result = await mediaHealth();
  res.status(result.status).json(result.data);
};

export const createJob = async (req, res) => {
  const result = await createMediaJob(readSession(req).id, req.body?.url);
  res.status(result.status).json(result.data);
};

export const createSearchJob = async (req, res) => {
  const result = await createSearchMediaJob(readSession(req).id, req.body?.query, req.body?.referenceUrl);
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

export const getLyrics = async (req, res) => {
  const lesson = await findSpotifyLyrics(req.body?.url);
  if (lesson?.trackId) await saveTrackProgress(readSession(req).id, lesson.trackId, { status: "new" });
  res.json(lesson);
};

export const translateSyncedLyrics = async (req, res) => {
  try {
    return res.json(await translateLyrics({ ...req.body, authenticated: isOwnerAuthenticated(req) }));
  } catch (error) {
    if (!req.body?.trackId) throw error;
    try {
      await scheduleLyricsTranslationRetry({ trackId: req.body.trackId, error });
      return res.status(202).json({ status: "pending", translations: [], retrying: true });
    } catch {
      throw error;
    }
  }
};

export const lyricsTranslationStatus = async (req, res) => {
  const result = await getCachedTranslationStatus(req.params.id);
  res.status(result.status).json({
    status: result.data.status,
    ...(Array.isArray(result.data.translations) ? { translations: result.data.translations } : {})
  });
};

const relay = (result, res) => res.status(result.status).json(result.data);
const userId = (req) => readSession(req).id;
export const library = async (req, res) => {
  const result = await getLibrary(userId(req));
  result.data.spotify.configured = Boolean(env.spotifyClientId && env.spotifyClientSecret && env.spotifyRedirectUri);
  relay(result, res);
};
export const createPlaylist = async (req, res) => relay(await createLibraryPlaylist(userId(req), req.body), res);
export const playlist = async (req, res) => relay(await getLibraryPlaylist(userId(req), req.params.id), res);
export const updatePlaylist = async (req, res) => relay(await updateLibraryPlaylist(userId(req), req.params.id, req.body), res);
export const deletePlaylist = async (req, res) => relay(await deleteLibraryPlaylist(userId(req), req.params.id), res);
export const addPlaylistTrack = async (req, res) => relay(await addLibraryPlaylistTrack(userId(req), req.params.id, req.body), res);
export const removePlaylistTrack = async (req, res) => relay(await removeLibraryPlaylistTrack(userId(req), req.params.id, req.params.trackId), res);
export const openTrack = async (req, res) => relay(await openCachedTrack(userId(req), req.params.id), res);
export const trackProgress = async (req, res) => relay(await saveTrackProgress(userId(req), req.params.id, req.body), res);
export const discoverArtists = async (req, res) => relay(await discoverLibraryArtists(req.body?.name), res);
export const createArtist = async (req, res) => relay(await createLibraryArtist(userId(req), req.body), res);
export const artist = async (req, res) => relay(await getLibraryArtist(userId(req), req.params.id), res);
export const prepareArtistTrack = async (req, res) => relay(await prepareLibraryArtistTrack(userId(req), req.params.id), res);
export const spotifyConnect = async (req, res) => res.redirect(spotifyConnectUrl(userId(req)));
export const spotifyCallback = async (req, res) => {
  await completeSpotifyConnection({ userId: userId(req), code: req.query.code, state: req.query.state });
  res.redirect("/?spotify=connected");
};
export const spotifyImportPlaylist = async (req, res) => res.json(await importConnectedSpotifyPlaylist(userId(req), req.body?.url));
export const createSearch = async (req, res) => relay(await createLyricsSearchJob(req.body?.query), res);
export const getSearch = async (req, res) => relay(await getLyricsSearchJob(req.params.id), res);
export const prepareSearchResult = async (req, res) => relay(await prepareLyricsSearchResult(userId(req), req.params.id), res);
