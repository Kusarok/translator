import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { addPlaylistTrack, createJob, createPlaylist, createSearchJob, deleteMedia, getJob, getLyrics, health, library, openTrack, playlist, spotifyCallback, spotifyConnect, spotifyImportPlaylist, streamArtwork, streamMedia, trackProgress, translateSyncedLyrics } from "../controllers/media.controller.js";

export const mediaRouter = Router();

mediaRouter.get("/health", asyncHandler(health));
mediaRouter.get("/library", asyncHandler(library));
mediaRouter.post("/library/playlists", asyncHandler(createPlaylist));
mediaRouter.get("/library/playlists/:id", asyncHandler(playlist));
mediaRouter.post("/library/playlists/:id/tracks", asyncHandler(addPlaylistTrack));
mediaRouter.post("/library/tracks/:id/open", asyncHandler(openTrack));
mediaRouter.post("/library/tracks/:id/progress", asyncHandler(trackProgress));
mediaRouter.get("/spotify/connect", asyncHandler(spotifyConnect));
mediaRouter.get("/spotify/callback", asyncHandler(spotifyCallback));
mediaRouter.post("/spotify/import-playlist", asyncHandler(spotifyImportPlaylist));
mediaRouter.post("/lyrics", asyncHandler(getLyrics));
mediaRouter.post("/lyrics/translate", asyncHandler(translateSyncedLyrics));
mediaRouter.post("/jobs", asyncHandler(createJob));
mediaRouter.post("/search-jobs", asyncHandler(createSearchJob));
mediaRouter.get("/jobs/:id", asyncHandler(getJob));
mediaRouter.get("/artwork/:id", asyncHandler(streamArtwork));
mediaRouter.get("/:id/stream", asyncHandler(streamMedia("stream")));
mediaRouter.get("/:id/download", asyncHandler(streamMedia("download")));
mediaRouter.delete("/:id", asyncHandler(deleteMedia));
