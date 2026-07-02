import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { translateRouter } from "./routes/translate.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientPath = path.resolve(__dirname, "../client");

export const createApp = () => {
  const app = express();

  app.use(helmet({
    strictTransportSecurity: false,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'"]
      }
    }
  }));

  app.use(express.json({ limit: "256kb" }));
  app.use(express.static(clientPath));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      model: env.cerebrasModel,
      models: env.availableModels,
      maxTextLength: env.maxTextLength
    });
  });

  app.use("/api/translate", rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false
  }), translateRouter);

  app.use((_req, res) => {
    res.sendFile(path.join(clientPath, "index.html"));
  });

  app.use((err, _req, res, _next) => {
    const status = Number.isInteger(err.status) ? err.status : 500;

    res.status(status).json({
      error: err.message || "Internal server error",
      details: err.details || null
    });
  });

  return app;
};
