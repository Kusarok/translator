import crypto from "node:crypto";
import { env } from "../config/env.js";
import { createOwnerAccount, createSession, deleteSession, readAccountSession } from "./account.store.js";
import { HttpError } from "../utils/http-error.js";

const COOKIE_NAME = "translator_session";
const ttlSeconds = () => env.sessionTtlHours * 3600;

const timingSafeEqualStr = (a, b) => {
  const left = crypto.createHash("sha256").update(String(a ?? "")).digest();
  const right = crypto.createHash("sha256").update(String(b ?? "")).digest();
  return crypto.timingSafeEqual(left, right);
};

export const parseCookies = (header) => {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key) cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
};

export const gateEnabled = () => true;
export const googleLoginEnabled = () => Boolean(env.googleClientId && env.googleClientSecret && env.googleRedirectUri);
export const verifyCredentials = ({ username, password }) => Boolean(env.ownerUsername && env.ownerPassword) &&
  timingSafeEqualStr(username, env.ownerUsername) && timingSafeEqualStr(password, env.ownerPassword);

export const readSessionToken = (req) => parseCookies(req.headers?.cookie)[COOKIE_NAME] || "";
export const readSession = (req) => readAccountSession(readSessionToken(req));
export const isUserAuthenticated = (req) => Boolean(readSession(req));
export const isOwnerAuthenticated = (req) => readSession(req)?.role === "owner";

export const setSessionCookie = (res, req, user) => {
  const token = createSession(user.id);
  const attrs = [`${COOKIE_NAME}=${encodeURIComponent(token)}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${ttlSeconds()}`];
  if (req?.secure || req?.headers?.["x-forwarded-proto"] === "https") attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
};

export const clearSessionCookie = (res, req) => {
  deleteSession(readSessionToken(req));
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
};

export const legacyOwnerLogin = ({ username, password }) => {
  if (!verifyCredentials({ username, password })) return null;
  return createOwnerAccount({ email: String(username).includes("@") ? username : "owner@local.invalid" });
};

export const requireUser = (req, _res, next) => readSession(req) ? next() : next(new HttpError(401, "Sign in to continue."));
export const requireOwner = (req, _res, next) => isOwnerAuthenticated(req) ? next() : next(new HttpError(403, "Owner access required."));
