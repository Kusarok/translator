import { Router } from "express";
import rateLimit from "express-rate-limit";
import { googleCallback, googleStart, login, logout, register, session, unlock } from "../controllers/auth.controller.js";
import { asyncHandler } from "../utils/async-handler.js";

export const authRouter = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

authRouter.get("/session", asyncHandler(session));
authRouter.post("/register", authLimiter, asyncHandler(register));
authRouter.post("/login", authLimiter, asyncHandler(login));
authRouter.post("/unlock", authLimiter, asyncHandler(unlock));
authRouter.get("/google", asyncHandler(googleStart));
authRouter.get("/google/callback", asyncHandler(googleCallback));
authRouter.post("/logout", asyncHandler(logout));
