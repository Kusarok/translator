import { Router } from "express";
import { translate } from "../controllers/translate.controller.js";
import { asyncHandler } from "../utils/async-handler.js";

export const translateRouter = Router();

translateRouter.post("/", asyncHandler(translate));
