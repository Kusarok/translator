import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getSettings, updateSettings, testSettings } from "../controllers/settings.controller.js";
import { asyncHandler } from "../utils/async-handler.js";
import { requireOwner } from "../services/auth.service.js";

export const settingsRouter = Router();

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
});

settingsRouter.get("/", requireOwner, asyncHandler(getSettings));
settingsRouter.post("/", requireOwner, writeLimiter, asyncHandler(updateSettings));
settingsRouter.post("/test", writeLimiter, asyncHandler(testSettings));
