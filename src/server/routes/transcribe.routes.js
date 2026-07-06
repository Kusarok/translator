import { Router } from "express";
import { transcribe } from "../controllers/transcribe.controller.js";
import { asyncHandler } from "../utils/async-handler.js";

export const transcribeRouter = Router();

transcribeRouter.post("/", asyncHandler(transcribe));
