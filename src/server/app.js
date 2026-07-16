import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { chatConfig } from "./config/chat.config.js";
import { providerCatalog, publicModels } from "./config/providers.js";
import { getPublicState } from "./services/settings.store.js";
import { gateEnabled, googleLoginEnabled, isOwnerAuthenticated, readSession } from "./services/auth.service.js";
import { freeTierEnabled, freeTierInfo } from "./services/free-tier.service.js";
import { translateRouter } from "./routes/translate.routes.js";
import { transcribeRouter } from "./routes/transcribe.routes.js";
import { chatRouter } from "./routes/chat.routes.js";
import { settingsRouter } from "./routes/settings.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { mediaRouter } from "./routes/media.routes.js";
import { radioRouter } from "./routes/radio.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientPath = path.resolve(__dirname, "../client");
const indexPath = path.join(clientPath, "index.html");
const hlsClientPath = path.resolve(__dirname, "../../node_modules/hls.js/dist/hls.min.js");
const assetVersion = String(Date.now());

const sendIndex = (res) => {
  const html = fs.readFileSync(indexPath, "utf8").replaceAll("__ASSET_VERSION__", assetVersion);
  res.set("Cache-Control", "no-cache");
  res.type("html").send(html);
};

const jsDir = path.join(clientPath, "assets", "js");

const versionImports = (code) =>
  code.replace(/((?:from|import)\s*\(?\s*)(["'])(\.\.?\/[^"']+?\.js)\2/g,
    (_match, prefix, quote, spec) => `${prefix}${quote}${spec}?v=${assetVersion}${quote}`);

const serveModule = (req, res, next) => {
  const filePath = path.join(clientPath, req.path);
  if (!filePath.startsWith(jsDir)) {
    return next();
  }
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      return next();
    }
    res.set("Cache-Control", "no-cache");
    res.type("application/javascript").send(versionImports(data));
  });
};

export const createApp = () => {
  const app = express();

  if (env.trustProxy !== false) {
    app.set("trust proxy", env.trustProxy);
  }

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
        frameSrc: [
          "'self'",
          "https://www.youtube-nocookie.com",
          "https://www.instagram.com",
          "https://www.tiktok.com",
          "https://platform.twitter.com",
          "https://www.facebook.com"
        ],
        imgSrc: ["'self'", "data:", "https:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'"]
      }
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
  }));

  // Transcription carries base64 audio (up to 20 MB raw -> ~27 MB encoded), so give just this
  // route a larger body parser, mounted before the 15 MB global parser. body-parser sets
  // req._body once parsed, so the global parser below skips it and other routes stay at 15 MB.
  app.use("/api/transcribe", express.json({ limit: "30mb" }));

  app.use(express.json({ limit: "15mb" }));
  app.get("/", (_req, res) => sendIndex(res));
  app.get("/vendor/hls.min.js", (_req, res) => {
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.type("application/javascript").sendFile(hlsClientPath);
  });
  app.get(/^\/assets\/js\/.+\.js$/, serveModule);
  app.use(express.static(clientPath, { index: false }));

  // Every personal API is behind a real user session. Health and auth stay public
  // so the sign-in screen can render and create an account.
  const PUBLIC_API = /^\/(health|auth)/;
  app.use("/api", (req, res, next) => {
    if (readSession(req)) return next();
    if (PUBLIC_API.test(req.path)) return next();
    return res.status(401).json({ error: "Authentication required." });
  });

  app.get("/api/health", (req, res) => {
    const user = readSession(req);
    const authenticated = Boolean(user);

    // Signed-out visitors only receive what the account screen needs.
    if (!authenticated) {
      return res.json({ ok: true, auth: { gateEnabled: true, authenticated: false, owner: false, googleEnabled: googleLoginEnabled() } });
    }

    const state = getPublicState();
    const active = state.providers.find((provider) => provider.id === state.activeProvider);
    const google = state.providers.find((provider) => provider.id === "google");

    res.json({
      ok: true,
      provider: state.activeProvider,
      providers: state.providers.map(({ id, label, configured }) => ({ id, label, configured })),
      model: active.selectedModel,
      models: active.models,
      maxTextLength: env.maxTextLength,
      chat: { ...chatConfig, models: active.models, defaultModel: active.selectedModel },
      live: { available: Boolean(google?.configured) && user.role === "owner", model: "gemini-3.5-live-translate-preview" },
      transcription: { available: user.role === "owner" && Boolean(env.groqApiKey), model: env.groqSttModel },
      catalog: providerCatalog.map((provider) => ({ id: provider.id, label: provider.label, models: publicModels(provider) })),
      auth: { gateEnabled: gateEnabled(), authenticated, owner: user.role === "owner", googleEnabled: googleLoginEnabled(), user },
      free: freeTierInfo()
    });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/settings", settingsRouter);

  // A request is BYOK only when BOTH provider and key are present — this mirrors
  // resolveRuntime() exactly. Checking the key alone would let `{ apiKey: "x" }` (no
  // provider) skip the free limiter while still falling through to the free server key.
  const isByokRequest = (req) =>
    Boolean(String(req.body?.provider || "").trim() && String(req.body?.apiKey || "").trim());

  // A request falls back to the shared free tier only when the visitor is not the owner
  // and did not bring their own key. BYOK and owner traffic must not be counted against
  // (or blocked by) the free quota, so we skip them here.
  const isFreeRequest = (req) =>
    freeTierEnabled() &&
    !isOwnerAuthenticated(req) &&
    !isByokRequest(req);

  // One shared limiter instance mounted on both routes => translate + chat draw from the
  // same per-visitor budget (default 5/min), keyed by IP. Requires TRUST_PROXY to be set
  // correctly behind a proxy, otherwise every visitor shares the proxy's IP.
  const freeTierLimiter = rateLimit({
    windowMs: env.freeWindowMs,
    limit: env.freeRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !isFreeRequest(req),
    handler: (_req, res) => {
      res.status(429).json({
        error: `Free limit reached (${env.freeRateLimit} requests/minute). Wait a minute, or add your own API key in Settings for unlimited use.`
      });
    }
  });

  app.use("/api/translate", freeTierLimiter, rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false
  }), translateRouter);

  app.use("/api/chat", freeTierLimiter, rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false
  }), chatRouter);

  // Audio/song transcription via Groq Whisper. The server GROQ_API_KEY is owner-only (see
  // transcription.service.js); anonymous visitors can only transcribe with their own BYOK Groq
  // key, so no free-tier limiter here — just a tighter per-route cap bounding the owner key,
  // since each request spends real audio-minutes.
  app.use("/api/transcribe", rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false
  }), transcribeRouter);

  app.use("/api/media", rateLimit({
    windowMs: 60 * 1000,
    // The client polls once per second while a background job is active. This ceiling still
    // bounds abusive traffic without causing legitimate long-running downloads to self-block.
    limit: 180,
    standardHeaders: true,
    legacyHeaders: false
  }), mediaRouter);

  app.use("/api/radio", radioRouter);

  app.use((_req, res) => sendIndex(res));

  app.use((err, _req, res, _next) => {
    const status = Number.isInteger(err.status) ? err.status : 500;

    res.status(status).json({
      error: err.message || "Internal server error",
      details: err.details || null
    });
  });

  return app;
};
