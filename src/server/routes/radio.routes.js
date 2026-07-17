import { Router } from "express";
import { createPersonalStation, deletePersonalStation, health, personalStations, stations, stream, updatePersonalStation } from "../controllers/radio.controller.js";
import { asyncHandler } from "../utils/async-handler.js";

export const radioRouter = Router();
radioRouter.get("/health", asyncHandler(health));
radioRouter.get("/stations", asyncHandler(stations));
radioRouter.get("/stations/:id/:file", asyncHandler(stream));
radioRouter.get("/my-stations", asyncHandler(personalStations));
radioRouter.post("/my-stations", asyncHandler(createPersonalStation));
radioRouter.patch("/my-stations/:id", asyncHandler(updatePersonalStation));
radioRouter.delete("/my-stations/:id", asyncHandler(deletePersonalStation));
