import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parsePorts = (value, fallback) => {
  if (!value) return [fallback];
  const list = value
    .split(",")
    .map((entry) => toPositiveInt(entry.trim(), 0))
    .filter((entry) => entry > 0);
  const unique = [...new Set(list)];
  return unique.length ? unique : [fallback];
};

const parseTrustProxy = (value) => {
  if (!value) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
};

const parseBool = (value, fallback) => {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
};

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const port = toPositiveInt(process.env.PORT, 8080);

export const env = {
  host: process.env.HOST || "0.0.0.0",
  port,
  ports: parsePorts(process.env.PORTS, port),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  defaultProvider: process.env.DEFAULT_PROVIDER || "",
  maxTextLength: toPositiveInt(process.env.MAX_TEXT_LENGTH, 8000),
  // Groq speech-to-text (Whisper). Powers /api/transcribe for audio/song transcription.
  // The key is server-side only; whisper-large-v3-turbo is the cheapest/fastest model and
  // translation of the transcript is handled downstream by the normal LLM pipeline.
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqBaseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
  groqSttModel: process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo",
  mediaWorkerUrl: process.env.MEDIA_WORKER_URL || "http://127.0.0.1:8090",
  radioWorkerUrl: process.env.RADIO_WORKER_URL || "http://127.0.0.1:8091",
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || "",
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
  spotifyRedirectUri: process.env.SPOTIFY_REDIRECT_URI || "",
  dataDir: process.env.APP_DATA_DIR || path.join(rootDir, "data"),
  ownerUsername: process.env.OWNER_USERNAME || "",
  ownerPassword: process.env.OWNER_PASSWORD || "",
  sessionTtlHours: toPositiveInt(process.env.SESSION_TTL_HOURS, 720),
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  dailyNewSongLimit: toPositiveInt(process.env.DAILY_NEW_SONG_LIMIT, 5),
  // Free tier: let anonymous visitors use one server-funded model without a key.
  // Defaults to ON so a deployment that configures FREE_PROVIDER's key gets it out of the box;
  // set FREE_TIER_ENABLED=false to turn it off entirely.
  freeTierEnabled: parseBool(process.env.FREE_TIER_ENABLED, true),
  freeProvider: process.env.FREE_PROVIDER || "cerebras",
  freeModel: process.env.FREE_MODEL || "gemma-4-31b",
  // How many free requests each visitor gets per minute (translate + chat combined).
  freeRateLimit: toPositiveInt(process.env.FREE_RATE_LIMIT, 5),
  freeWindowMs: 60 * 1000,
  // Hard cap on output tokens for free requests, so the shared key can't be drained.
  freeMaxTokens: toPositiveInt(process.env.FREE_MAX_TOKENS, 2048),
  // Hard cap on images per free chat request (vision is expensive).
  freeMaxImages: toPositiveInt(process.env.FREE_MAX_IMAGES, 2),
  // Hard cap on total input characters (all message text + system prompt) per free chat
  // request, so anonymous users can't burn prompt tokens up to the 15 MB body limit.
  freeMaxInputChars: toPositiveInt(process.env.FREE_MAX_INPUT_CHARS, 16000)
};
