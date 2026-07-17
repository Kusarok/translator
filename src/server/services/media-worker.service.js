import http from "node:http";
import https from "node:https";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

const workerUrl = new URL(env.mediaWorkerUrl);
const transport = workerUrl.protocol === "https:" ? https : http;
const userHeaders = (userId) => userId ? { "X-Translator-User-Id": userId } : {};

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
export const createMediaJob = (userId, url) => workerRequest({ method: "POST", pathname: "/jobs", body: { url }, headers: userHeaders(userId) });
export const createSearchMediaJob = (userId, query, referenceUrl = "") => workerRequest({ method: "POST", pathname: "/search-jobs", body: { query, referenceUrl }, headers: userHeaders(userId) });
export const getMediaJob = (id) => workerRequest({ pathname: `/jobs/${encodeURIComponent(id)}` });
export const getCachedLesson = (spotifyId) => workerRequest({ pathname: `/cache/lessons/spotify/${encodeURIComponent(spotifyId)}` });
export const getCachedLessonByTrackId = (trackId) => workerRequest({ pathname: `/cache/lessons/tracks/${encodeURIComponent(trackId)}` });
export const cacheTrackLyrics = (track) => workerRequest({ method: "PUT", pathname: "/cache/lyrics", body: track });
export const cacheLessonTranslation = (translation) => workerRequest({ method: "PUT", pathname: "/cache/translations", body: translation });
export const scheduleLyricsTranslation = (payload) => workerRequest({ method: "POST", pathname: "/translation-jobs", body: payload });
export const getLyricsTranslationStatus = (trackId) => workerRequest({ pathname: `/translation-jobs/tracks/${encodeURIComponent(trackId)}` });
export const getDueLyricsTranslations = (limit = 2) => workerRequest({ pathname: `/translation-jobs/due?limit=${encodeURIComponent(limit)}` });
export const updateLyricsTranslationJob = (id, payload) => workerRequest({ method: "PATCH", pathname: `/translation-jobs/${encodeURIComponent(id)}`, body: payload });
export const getLibrary = (userId) => workerRequest({ pathname: "/library", headers: userHeaders(userId) });
export const getPublicLibrary = () => workerRequest({ pathname: "/public/library" });
export const getPublicTrack = (id) => workerRequest({ pathname: `/public/library/tracks/${encodeURIComponent(id)}` });
export const discoverLibraryArtists = (name) => workerRequest({ method: "POST", pathname: "/artists/discover", body: { name } });
export const createLibraryArtist = (userId, payload) => workerRequest({ method: "POST", pathname: "/artists", body: payload, headers: userHeaders(userId) });
export const getLibraryArtist = (userId, id) => workerRequest({ pathname: `/artists/${encodeURIComponent(id)}`, headers: userHeaders(userId) });
export const prepareLibraryArtistTrack = (userId, id) => workerRequest({ method: "POST", pathname: `/artists/catalog/${encodeURIComponent(id)}/prepare`, headers: userHeaders(userId) });
export const createLibraryPlaylist = (userId, payload) => workerRequest({ method: "POST", pathname: "/playlists", body: payload, headers: userHeaders(userId) });
export const getLibraryPlaylist = (userId, id) => workerRequest({ pathname: `/playlists/${encodeURIComponent(id)}`, headers: userHeaders(userId) });
export const updateLibraryPlaylist = (userId, id, payload) => workerRequest({ method: "PATCH", pathname: `/playlists/${encodeURIComponent(id)}`, body: payload, headers: userHeaders(userId) });
export const deleteLibraryPlaylist = (userId, id) => workerRequest({ method: "DELETE", pathname: `/playlists/${encodeURIComponent(id)}`, headers: userHeaders(userId) });
export const addLibraryPlaylistTrack = (userId, id, payload) => workerRequest({ method: "POST", pathname: `/playlists/${encodeURIComponent(id)}/tracks`, body: payload, headers: userHeaders(userId) });
export const removeLibraryPlaylistTrack = (userId, id, trackId) => workerRequest({ method: "DELETE", pathname: `/playlists/${encodeURIComponent(id)}/tracks/${encodeURIComponent(trackId)}`, headers: userHeaders(userId) });
export const openCachedTrack = (userId, id) => workerRequest({ method: "POST", pathname: `/library/tracks/${encodeURIComponent(id)}/open`, headers: userHeaders(userId) });
export const saveTrackProgress = (userId, id, payload) => workerRequest({ method: "POST", pathname: `/library/tracks/${encodeURIComponent(id)}/progress`, body: payload, headers: userHeaders(userId) });
export const getSpotifyAccount = (userId) => workerRequest({ pathname: "/spotify-account", headers: userHeaders(userId) });
export const saveSpotifyAccount = (userId, payload) => workerRequest({ method: "PUT", pathname: "/spotify-account", body: payload, headers: userHeaders(userId) });
export const importSpotifyPlaylistCache = (userId, payload) => workerRequest({ method: "PUT", pathname: "/playlists/spotify", body: payload, headers: userHeaders(userId) });
export const createLyricsSearchJob = (query) => workerRequest({ method: "POST", pathname: "/lyrics-search", body: { query } });
export const getLyricsSearchJob = (id) => workerRequest({ pathname: `/lyrics-search/${encodeURIComponent(id)}` });
export const prepareLyricsSearchResult = (userId, id) => workerRequest({ method: "POST", pathname: `/lyrics-search/results/${encodeURIComponent(id)}/prepare`, headers: userHeaders(userId) });
export const removeMedia = (id) => workerRequest({ method: "DELETE", pathname: `/media/${encodeURIComponent(id)}` });
export const mediaStream = (id, kind, range) => workerRequest({
  pathname: `/media/${encodeURIComponent(id)}/${kind}`,
  headers: range ? { Range: range } : {},
  stream: true
});
export const artworkStream = (id) => workerRequest({ pathname: `/artwork/${encodeURIComponent(id)}`, stream: true });
export const publicMediaStream = (id, range) => workerRequest({
  pathname: `/public/media/${encodeURIComponent(id)}/stream`,
  headers: range ? { Range: range } : {}, stream: true
});
export const publicArtworkStream = (id) => workerRequest({ pathname: `/public/artwork/${encodeURIComponent(id)}`, stream: true });
