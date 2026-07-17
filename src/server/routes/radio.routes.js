import { Router } from "express";
import { health, stations, stream } from "../controllers/radio.controller.js";
import { asyncHandler } from "../utils/async-handler.js";

export const radioRouter = Router();
radioRouter.get("/health", asyncHandler(health));
radioRouter.get("/stations", asyncHandler(stations));
radioRouter.get("/stations/:id/:file", asyncHandler(stream));
