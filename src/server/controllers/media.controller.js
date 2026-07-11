import { createMediaJob, getMediaJob, mediaHealth, mediaStream, removeMedia } from "../services/media-worker.service.js";
import { findSpotifyLyrics, translateLyrics } from "../services/lyrics.service.js";
import { isOwnerAuthenticated } from "../services/auth.service.js";

export const health = async (_req, res) => {
  const result = await mediaHealth();
  res.status(result.status).json(result.data);
};

export const createJob = async (req, res) => {
  const result = await createMediaJob(req.body?.url);
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

export const getLyrics = async (req, res) => res.json(await findSpotifyLyrics(req.body?.url));

export const translateSyncedLyrics = async (req, res) => res.json(await translateLyrics({
  ...req.body,
  authenticated: isOwnerAuthenticated(req)
}));
