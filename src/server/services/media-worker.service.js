import http from "node:http";
import https from "node:https";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

const workerUrl = new URL(env.mediaWorkerUrl);
const transport = workerUrl.protocol === "https:" ? https : http;

const workerRequest = ({ method = "GET", pathname, body, headers = {}, stream = false }) =>
  new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const request = transport.request(new URL(pathname, workerUrl), {
      method,
      headers: {
        Accept: "application/json",
        ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
        ...headers
      },
      timeout: 65000
    }, (response) => {
      if (stream && response.statusCode < 400) return resolve(response);
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data = {};
        try { data = JSON.parse(text || "{}"); } catch { data = { error: text || "Media worker returned an invalid response." }; }
        if (response.statusCode >= 400) reject(new HttpError(response.statusCode, data.error || "Media request failed."));
        else resolve({ status: response.statusCode, data, headers: response.headers });
      });
    });
    request.on("timeout", () => request.destroy(new Error("Media worker did not respond in time.")));
    request.on("error", () => reject(new HttpError(503, "Media service is temporarily unavailable.")));
    if (payload) request.write(payload);
    request.end();
  });

export const mediaHealth = () => workerRequest({ pathname: "/health" });
export const createMediaJob = (url) => workerRequest({ method: "POST", pathname: "/jobs", body: { url } });
export const createSearchMediaJob = (query, referenceUrl = "") => workerRequest({ method: "POST", pathname: "/search-jobs", body: { query, referenceUrl } });
export const getMediaJob = (id) => workerRequest({ pathname: `/jobs/${encodeURIComponent(id)}` });
export const getCachedLesson = (spotifyId) => workerRequest({ pathname: `/cache/lessons/spotify/${encodeURIComponent(spotifyId)}` });
export const getCachedLessonByTrackId = (trackId) => workerRequest({ pathname: `/cache/lessons/tracks/${encodeURIComponent(trackId)}` });
export const cacheTrackLyrics = (track) => workerRequest({ method: "PUT", pathname: "/cache/lyrics", body: track });
export const cacheLessonTranslation = (translation) => workerRequest({ method: "PUT", pathname: "/cache/translations", body: translation });
export const getLibrary = () => workerRequest({ pathname: "/library" });
export const discoverLibraryArtists = (name) => workerRequest({ method: "POST", pathname: "/artists/discover", body: { name } });
export const createLibraryArtist = (payload) => workerRequest({ method: "POST", pathname: "/artists", body: payload });
export const getLibraryArtist = (id) => workerRequest({ pathname: `/artists/${encodeURIComponent(id)}` });
export const prepareLibraryArtistTrack = (id) => workerRequest({ method: "POST", pathname: `/artists/catalog/${encodeURIComponent(id)}/prepare` });
export const createLibraryPlaylist = (payload) => workerRequest({ method: "POST", pathname: "/playlists", body: payload });
export const getLibraryPlaylist = (id) => workerRequest({ pathname: `/playlists/${encodeURIComponent(id)}` });
export const updateLibraryPlaylist = (id, payload) => workerRequest({ method: "PATCH", pathname: `/playlists/${encodeURIComponent(id)}`, body: payload });
export const deleteLibraryPlaylist = (id) => workerRequest({ method: "DELETE", pathname: `/playlists/${encodeURIComponent(id)}` });
export const addLibraryPlaylistTrack = (id, payload) => workerRequest({ method: "POST", pathname: `/playlists/${encodeURIComponent(id)}/tracks`, body: payload });
export const removeLibraryPlaylistTrack = (id, trackId) => workerRequest({ method: "DELETE", pathname: `/playlists/${encodeURIComponent(id)}/tracks/${encodeURIComponent(trackId)}` });
export const openCachedTrack = (id) => workerRequest({ method: "POST", pathname: `/library/tracks/${encodeURIComponent(id)}/open` });
export const saveTrackProgress = (id, payload) => workerRequest({ method: "POST", pathname: `/library/tracks/${encodeURIComponent(id)}/progress`, body: payload });
export const getSpotifyAccount = () => workerRequest({ pathname: "/spotify-account" });
export const saveSpotifyAccount = (payload) => workerRequest({ method: "PUT", pathname: "/spotify-account", body: payload });
export const importSpotifyPlaylistCache = (payload) => workerRequest({ method: "PUT", pathname: "/playlists/spotify", body: payload });
export const createLyricsSearchJob = (query) => workerRequest({ method: "POST", pathname: "/lyrics-search", body: { query } });
export const getLyricsSearchJob = (id) => workerRequest({ pathname: `/lyrics-search/${encodeURIComponent(id)}` });
export const prepareLyricsSearchResult = (id) => workerRequest({ method: "POST", pathname: `/lyrics-search/results/${encodeURIComponent(id)}/prepare` });
export const removeMedia = (id) => workerRequest({ method: "DELETE", pathname: `/media/${encodeURIComponent(id)}` });
export const mediaStream = (id, kind, range) => workerRequest({
  pathname: `/media/${encodeURIComponent(id)}/${kind}`,
  headers: range ? { Range: range } : {},
  stream: true
});
export const artworkStream = (id) => workerRequest({ pathname: `/artwork/${encodeURIComponent(id)}`, stream: true });
