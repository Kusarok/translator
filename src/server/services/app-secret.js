import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

const secretFile = path.join(env.dataDir, "app-secret.key");

const loadSecret = () => {
  fs.mkdirSync(env.dataDir, { recursive: true });
  try {
    const value = fs.readFileSync(secretFile, "utf8").trim();
    if (value.length >= 43) { fs.chmodSync(secretFile, 0o600); return value; }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const value = crypto.randomBytes(32).toString("base64url");
  try { fs.writeFileSync(secretFile, `${value}\n`, { mode: 0o600, flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; return fs.readFileSync(secretFile, "utf8").trim(); }
  return value;
};

const master = loadSecret();
export const appKey = (purpose) => crypto.createHmac("sha256", master).update(String(purpose)).digest();

export const sealSecret = (value, purpose) => {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", appKey(purpose), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return `enc:v1:${[iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".")}`;
};

export const openSecret = (value, purpose) => {
  const encoded = String(value || "");
  if (!encoded.startsWith("enc:v1:")) return encoded;
  const [iv, tag, encrypted] = encoded.slice(7).split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", appKey(purpose), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
};
