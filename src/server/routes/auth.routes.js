import { Router } from "express";
import rateLimit from "express-rate-limit";
import { unlock, logout } from "../controllers/auth.controller.js";
import { asyncHandler } from "../utils/async-handler.js";

export const authRouter = Router();

const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});

authRouter.post("/unlock", unlockLimiter, asyncHandler(unlock));
authRouter.post("/logout", asyncHandler(logout));
