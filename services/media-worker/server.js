import http from "node:http";
import fs from "node:fs";
import { config } from "./config.js";
import { capabilities } from "./downloader.js";
import { platformCatalog } from "./adapters/platforms.js";
import { cleanupExpired, createJob, createSearchJob, deleteMedia, getJob, getMedia } from "./jobs.js";
import { safeMediaPath } from "./storage.js";
import { cacheTrackLyrics, cacheTranslation, getCachedLesson, getCachedLessonByTrackId, reindexCachedLyrics } from "./services/lesson-cache.service.js";
import { repositories } from "./persistence.js";
import path from "node:path";
import { addTrackToPlaylist, createLearningPlaylist, deleteLearningPlaylist, getPlaylistDetail, importSpotifyPlaylist, libraryOverview, openLibraryTrack, removeTrackFromPlaylist, updateLearningPlaylist, updateTrackProgress } from "./services/library.service.js";
import { createLyricsSearch, getLyricsSearch, prepareSearchResult } from "./modules/search/search.service.js";
import { createArtistCatalog, discoverArtists, getArtistCatalog, prepareArtistCatalogItem } from "./modules/artists/artist.service.js";
import { dueTranslationJobs, getTranslationJobForTrack, publicTranslationJob, scheduleTranslationJob, updateTranslationJob } from "./services/translation-job.service.js";

reindexCachedLyrics();

const json = (res, status, body) => {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": data.length, "Cache-Control": "no-store" });
  res.end(data);
};

const body = async (req) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

const serveFile = (req, res, item, download) => {
  const filePath = safeMediaPath(item);
  if (!filePath || !fs.existsSync(filePath)) return json(res, 404, { error: "Media file not found." });
  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  const common = {
    "Content-Type": item.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=300"
  };
  if (download) common["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(item.filename)}`;
  if (!range) {
    res.writeHead(200, { ...common, "Content-Length": stat.size });
    return fs.createReadStream(filePath).pipe(res);
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
    return res.end();
  }
  const hasStart = match[1] !== "";
  const hasEnd = match[2] !== "";
  let start;
  let end;
  if (!hasStart && !hasEnd) {
    start = stat.size;
    end = -1;
  } else if (!hasStart) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      start = stat.size;
      end = -1;
    } else {
      end = stat.size - 1;
      start = Math.max(0, stat.size - suffixLength);
    }
  } else {
    start = Number(match[1]);
    end = hasEnd ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= stat.size) {
    res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
    return res.end();
  }
  res.writeHead(206, { ...common, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${stat.size}` });
  fs.createReadStream(filePath, { start, end }).pipe(res);
};

const serveArtwork = (res, item) => {
  const filePath = path.resolve(config.dataDir, item.relative_path);
  const root = `${path.resolve(config.artworkDir)}${path.sep}`;
  if (!filePath.startsWith(root) || !fs.existsSync(filePath)) return json(res, 404, { error: "Artwork not found." });
  const stat = fs.statSync(filePath);
  res.writeHead(200, { "Content-Type": item.mime_type || "image/jpeg", "Content-Length": stat.size,
    "Cache-Control": "public, max-age=86400, immutable" });
  fs.createReadStream(filePath).pipe(res);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, capabilities: capabilities(), platforms: platformCatalog() });
    }
    if (req.method === "GET" && url.pathname === "/library") return json(res, 200, libraryOverview());
    if (req.method === "POST" && url.pathname === "/artists/discover") return json(res, 200, { artists: await discoverArtists((await body(req)).name) });
    if (req.method === "POST" && url.pathname === "/artists") return json(res, 202, createArtistCatalog(await body(req)));
    const artistMatch = /^\/artists\/(ast_[A-Za-z0-9-]+)$/.exec(url.pathname);
    if (req.method === "GET" && artistMatch) {
      const artist = getArtistCatalog(artistMatch[1]);
      return artist ? json(res, 200, artist) : json(res, 404, { error: "Artist not found." });
    }
    const artistItemMatch = /^\/artists\/catalog\/(aci_[A-Za-z0-9-]+)\/prepare$/.exec(url.pathname);
    if (req.method === "POST" && artistItemMatch) {
      const lesson = await prepareArtistCatalogItem(artistItemMatch[1]);
      return lesson ? json(res, 200, lesson) : json(res, 404, { error: "Artist track not found." });
    }
    if (req.method === "POST" && url.pathname === "/lyrics-search") return json(res, 202, createLyricsSearch((await body(req)).query));
    if (req.method === "POST" && url.pathname === "/translation-jobs") {
      const job = scheduleTranslationJob(await body(req));
      return job ? json(res, 202, job) : json(res, 404, { error: "Track lyrics not found." });
    }
    if (req.method === "GET" && url.pathname === "/translation-jobs/due") {
      return json(res, 200, { jobs: dueTranslationJobs(url.searchParams.get("limit")).map((job) => ({
        id: job.id, trackId: job.track_id, targetLanguage: job.target_language, attempts: job.attempts
      })) });
    }
    const translationTrackMatch = /^\/translation-jobs\/tracks\/(trk_[A-Za-z0-9-]+)$/.exec(url.pathname);
    if (req.method === "GET" && translationTrackMatch) {
      const job = getTranslationJobForTrack(translationTrackMatch[1]);
      return job ? json(res, 200, job) : json(res, 404, { error: "Track lyrics not found." });
    }
    const translationJobMatch = /^\/translation-jobs\/(ltj_[A-Za-z0-9-]+)$/.exec(url.pathname);
    if (req.method === "PATCH" && translationJobMatch) {
      const job = updateTranslationJob(translationJobMatch[1], await body(req));
      return job ? json(res, 200, publicTranslationJob(job)) : json(res, 404, { error: "Translation job not found." });
    }
    const lyricsSearchMatch = /^\/lyrics-search\/(srj_[A-Za-z0-9-]+)$/.exec(url.pathname);
    if (req.method === "GET" && lyricsSearchMatch) {
      const job = getLyricsSearch(lyricsSearchMatch[1]);
      return job ? json(res, 200, job) : json(res, 404, { error: "Search job not found." });
    }
    const prepareSearchMatch = /^\/lyrics-search\/results\/(srs_[A-Za-z0-9-]+)\/prepare$/.exec(url.pathname);
    if (req.method === "POST" && prepareSearchMatch) {
      const lesson = await prepareSearchResult(prepareSearchMatch[1]);
      return lesson ? json(res, 200, lesson) : json(res, 404, { error: "Verified search result not found." });
    }
    if (req.method === "GET" && url.pathname === "/playlists") return json(res, 200, { playlists: libraryOverview().playlists });
    if (req.method === "POST" && url.pathname === "/playlists") return json(res, 201, createLearningPlaylist(await body(req)));
    if (req.method === "PUT" && url.pathname === "/playlists/spotify") return json(res, 200, importSpotifyPlaylist(await body(req)));
    if (req.method === "GET" && url.pathname === "/spotify-account") {
      const account = repositories.spotifyAccounts.current();
      return account ? json(res, 200, account) : json(res, 404, { error: "Spotify account is not connected." });
    }
    if (req.method === "PUT" && url.pathname === "/spotify-account") return json(res, 200, repositories.spotifyAccounts.upsert(await body(req)));
    const playlistMatch = /^\/playlists\/(pls_[A-Za-z0-9-]+)$/.exec(url.pathname);
    if (req.method === "GET" && playlistMatch) {
      const playlist = getPlaylistDetail(playlistMatch[1]);
      return playlist ? json(res, 200, playlist) : json(res, 404, { error: "Playlist not found." });
    }
    if (req.method === "PATCH" && playlistMatch) {
      const playlist = updateLearningPlaylist(playlistMatch[1], await body(req));
      return playlist ? json(res, 200, playlist) : json(res, 404, { error: "Playlist not found." });
    }
    if (req.method === "DELETE" && playlistMatch) {
      return deleteLearningPlaylist(playlistMatch[1]) ? json(res, 200, { ok: true }) : json(res, 404, { error: "Playlist not found." });
    }
    const playlistTrackMatch = /^\/playlists\/(pls_[A-Za-z0-9-]+)\/tracks$/.exec(url.pathname);
    if (req.method === "POST" && playlistTrackMatch) {
      const playlist = addTrackToPlaylist(playlistTrackMatch[1], await body(req));
      return playlist ? json(res, 200, playlist) : json(res, 404, { error: "Playlist not found." });
    }
    const removePlaylistTrackMatch = /^\/playlists\/(pls_[A-Za-z0-9-]+)\/tracks\/(trk_[A-Za-z0-9-]+)$/.exec(url.pathname);
    if (req.method === "DELETE" && removePlaylistTrackMatch) {
      return removeTrackFromPlaylist(removePlaylistTrackMatch[1], removePlaylistTrackMatch[2])
        ? json(res, 200, { ok: true }) : json(res, 404, { error: "Playlist track not found." });
    }
    const libraryTrackMatch = /^\/library\/tracks\/(trk_[A-Za-z0-9-]+)\/(open|progress)$/.exec(url.pathname);
    if (req.method === "POST" && libraryTrackMatch) {
      const result = libraryTrackMatch[2] === "open"
        ? openLibraryTrack(libraryTrackMatch[1])
        : updateTrackProgress(libraryTrackMatch[1], await body(req));
      return result ? json(res, 200, result) : json(res, 404, { error: "Track not found." });
    }
    if (req.method === "POST" && url.pathname === "/jobs") {
      const payload = await body(req);
      return json(res, 202, createJob(payload.url));
    }
    if (req.method === "POST" && url.pathname === "/search-jobs") {
      const payload = await body(req);
      if (!payload.query) return json(res, 400, { error: "A search query is required." });
      return json(res, 202, createSearchJob(payload.query, payload.referenceUrl || ""));
    }
    const lessonMatch = /^\/cache\/lessons\/spotify\/([A-Za-z0-9]{22})$/.exec(url.pathname);
    if (req.method === "GET" && lessonMatch) {
      const lesson = getCachedLesson(lessonMatch[1]);
      return lesson ? json(res, 200, lesson) : json(res, 404, { error: "Lesson is not cached." });
    }
    const trackLessonMatch = /^\/cache\/lessons\/tracks\/(trk_[A-Za-z0-9-]+)$/.exec(url.pathname);
    if (req.method === "GET" && trackLessonMatch) {
      const lesson = getCachedLessonByTrackId(trackLessonMatch[1]);
      return lesson ? json(res, 200, lesson) : json(res, 404, { error: "Lesson is not cached." });
    }
    if (req.method === "PUT" && url.pathname === "/cache/lyrics") {
      return json(res, 200, await cacheTrackLyrics(await body(req)));
    }
    if (req.method === "PUT" && url.pathname === "/cache/translations") {
      return json(res, 200, cacheTranslation(await body(req)));
    }
    const artworkMatch = /^\/artwork\/(art_[A-Za-z0-9-]+)$/.exec(url.pathname);
    if (req.method === "GET" && artworkMatch) {
      const artwork = repositories.artwork.findById(artworkMatch[1]);
      return artwork ? serveArtwork(res, artwork) : json(res, 404, { error: "Artwork not found." });
    }
    const jobMatch = /^\/jobs\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if (req.method === "GET" && jobMatch) {
      const job = getJob(jobMatch[1]);
      return job ? json(res, 200, job) : json(res, 404, { error: "Media job not found." });
    }
    const mediaMatch = /^\/media\/([A-Za-z0-9_-]+)\/(stream|download)$/.exec(url.pathname);
    if (req.method === "GET" && mediaMatch) {
      const item = getMedia(mediaMatch[1]);
      return item ? serveFile(req, res, item, mediaMatch[2] === "download") : json(res, 404, { error: "Media not found." });
    }
    const deleteMatch = /^\/media\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if (req.method === "DELETE" && deleteMatch) {
      return deleteMedia(deleteMatch[1]) ? json(res, 200, { ok: true }) : json(res, 404, { error: "Media not found." });
    }
    json(res, 404, { error: "Not found." });
  } catch (error) {
    json(res, 400, { error: error.message || "Request failed." });
  }
});

setInterval(cleanupExpired, 15 * 60 * 1000).unref();
server.listen(config.port, config.host, () => console.log(`Media worker is running on http://${config.host}:${config.port}`));
