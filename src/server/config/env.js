import dotenv from "dotenv";

dotenv.config({ quiet: true });

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const env = {
  host: process.env.HOST || "0.0.0.0",
  port: toPositiveInt(process.env.PORT, 8080),
  cerebrasApiKey: process.env.CEREBRAS_API_KEY || "",
  cerebrasModel: process.env.CEREBRAS_MODEL || "gemma-4-31b",
  cerebrasBaseUrl: process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1",
  maxTextLength: toPositiveInt(process.env.MAX_TEXT_LENGTH, 8000)
};
