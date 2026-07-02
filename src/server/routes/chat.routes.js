import { Router } from "express";
import { chat } from "../controllers/chat.controller.js";
import { asyncHandler } from "../utils/async-handler.js";

export const chatRouter = Router();

chatRouter.post("/", asyncHandler(chat));
