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

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const port = toPositiveInt(process.env.PORT, 8080);

export const env = {
  host: process.env.HOST || "0.0.0.0",
  port,
  ports: parsePorts(process.env.PORTS, port),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  defaultProvider: process.env.DEFAULT_PROVIDER || "",
  maxTextLength: toPositiveInt(process.env.MAX_TEXT_LENGTH, 8000),
  dataDir: path.join(rootDir, "data"),
  ownerUsername: process.env.OWNER_USERNAME || "",
  ownerPassword: process.env.OWNER_PASSWORD || "",
  sessionTtlHours: toPositiveInt(process.env.SESSION_TTL_HOURS, 720)
};
