import crypto from "node:crypto";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

const COOKIE_NAME = "owner_session";

const ttlMs = () => env.sessionTtlHours * 3600 * 1000;

const sign = (payload) => {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", env.ownerPassword).update(data).digest("base64url");
  return `${data}.${signature}`;
};

const verify = (token) => {
  const [data, signature] = String(token || "").split(".");
  if (!data || !signature) return null;

  const expected = crypto.createHmac("sha256", env.ownerPassword).update(data).digest("base64url");
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(expected);

  if (actual.length !== wanted.length || !crypto.timingSafeEqual(actual, wanted)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
};

const timingSafeEqualStr = (a, b) => {
  const bufA = crypto.createHash("sha256").update(String(a ?? "")).digest();
  const bufB = crypto.createHash("sha256").update(String(b ?? "")).digest();
  return crypto.timingSafeEqual(bufA, bufB);
};

const parseCookies = (header) => {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
};

export const gateEnabled = () => Boolean(env.ownerUsername && env.ownerPassword);

export const verifyCredentials = ({ username, password }) => {
  if (!gateEnabled()) return false;
  return timingSafeEqualStr(username, env.ownerUsername) && timingSafeEqualStr(password, env.ownerPassword);
};

export const readSession = (req) => {
  const token = parseCookies(req.headers?.cookie)[COOKIE_NAME];
  return token ? verify(token) : null;
};

export const isOwnerAuthenticated = (req) => (gateEnabled() ? Boolean(readSession(req)) : true);

export const setSessionCookie = (res, req) => {
  const token = sign({ exp: Date.now() + ttlMs() });
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${Math.floor(ttlMs() / 1000)}`
  ];
  if (req?.secure) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
};

export const clearSessionCookie = (res) => {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
};

export const requireOwner = (req, _res, next) => {
  if (isOwnerAuthenticated(req)) {
    return next();
  }
  next(new HttpError(401, "Owner login required to manage server-side keys."));
};
