import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { createJob, deleteMedia, getJob, getLyrics, health, streamMedia, translateSyncedLyrics } from "../controllers/media.controller.js";

export const mediaRouter = Router();

mediaRouter.get("/health", asyncHandler(health));
mediaRouter.post("/lyrics", asyncHandler(getLyrics));
mediaRouter.post("/lyrics/translate", asyncHandler(translateSyncedLyrics));
mediaRouter.post("/jobs", asyncHandler(createJob));
mediaRouter.get("/jobs/:id", asyncHandler(getJob));
mediaRouter.get("/:id/stream", asyncHandler(streamMedia("stream")));
mediaRouter.get("/:id/download", asyncHandler(streamMedia("download")));
mediaRouter.delete("/:id", asyncHandler(deleteMedia));
