import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { env } from "../config/env.js";

const scrypt = promisify(crypto.scrypt);
const databaseDirectory = path.join(env.dataDir, "database");
fs.mkdirSync(databaseDirectory, { recursive: true });
const db = new DatabaseSync(path.join(databaseDirectory, "accounts.sqlite"));
db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY CHECK(id LIKE 'usr_%'),
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    avatar_url TEXT NOT NULL DEFAULT '',
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','owner')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
  );
  CREATE TABLE IF NOT EXISTS user_identities (
    id TEXT PRIMARY KEY CHECK(id LIKE 'uid_%'),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(provider, subject)
  );
  CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY CHECK(id LIKE 'ses_%'),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS oauth_states (
    state_hash TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions(user_id);
  CREATE INDEX IF NOT EXISTS user_sessions_expiry_idx ON user_sessions(expires_at);
`);

const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const tokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const publicUser = (row) => row && ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  avatarUrl: row.avatar_url || "",
  role: row.role
});

const passwordHash = async (password) => {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = await scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt}$${Buffer.from(hash).toString("base64url")}`;
};

const passwordMatches = async (password, encoded) => {
  const [kind, n, r, p, salt, expected] = String(encoded || "").split("$");
  if (kind !== "scrypt" || !salt || !expected) return false;
  const actual = await scrypt(String(password), salt, 64, { N: Number(n), r: Number(r), p: Number(p) });
  const wanted = Buffer.from(expected, "base64url");
  return wanted.length === actual.length && crypto.timingSafeEqual(wanted, actual);
};

const findByEmail = (email) => db.prepare("SELECT * FROM users WHERE email=?").get(normalizeEmail(email)) || null;

export const createAccount = async ({ email, password, displayName }) => {
  const normalized = normalizeEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new TypeError("Enter a valid email address.");
  if (String(password || "").length < 8) throw new TypeError("Password must be at least 8 characters.");
  if (findByEmail(normalized)) throw new TypeError("An account with this email already exists.");
  const stamp = now();
  const userId = id("usr");
  db.prepare("INSERT INTO users(id,email,display_name,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .run(userId, normalized, String(displayName || "").trim().slice(0, 80) || normalized.split("@")[0], await passwordHash(password), stamp, stamp);
  return publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(userId));
};

export const authenticateAccount = async ({ email, password }) => {
  const user = findByEmail(email);
  if (!user?.password_hash || !(await passwordMatches(password, user.password_hash))) return null;
  db.prepare("UPDATE users SET last_login_at=?,updated_at=? WHERE id=?").run(now(), now(), user.id);
  return publicUser({ ...user, last_login_at: now() });
};

export const findOrCreateGoogleAccount = ({ subject, email, displayName, avatarUrl }) => {
  const identity = db.prepare(`SELECT u.* FROM user_identities i JOIN users u ON u.id=i.user_id
    WHERE i.provider='google' AND i.subject=?`).get(subject);
  if (identity) {
    db.prepare("UPDATE users SET display_name=?,avatar_url=?,last_login_at=?,updated_at=? WHERE id=?")
      .run(String(displayName || identity.display_name).slice(0, 80), String(avatarUrl || identity.avatar_url), now(), now(), identity.id);
    return publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(identity.id));
  }
  const normalized = normalizeEmail(email);
  let user = findByEmail(normalized);
  const stamp = now();
  if (!user) {
    const userId = id("usr");
    db.prepare("INSERT INTO users(id,email,display_name,avatar_url,created_at,updated_at,last_login_at) VALUES (?,?,?,?,?,?,?)")
      .run(userId, normalized, String(displayName || normalized.split("@")[0]).slice(0, 80), String(avatarUrl || ""), stamp, stamp, stamp);
    user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  }
  db.prepare("INSERT INTO user_identities(id,user_id,provider,subject,created_at) VALUES (?,?,?,?,?)")
    .run(id("uid"), user.id, "google", subject, stamp);
  return publicUser(user);
};

export const createOwnerAccount = ({ email }) => {
  const normalized = normalizeEmail(email || env.ownerUsername || "owner@local.invalid");
  let user = findByEmail(normalized) || db.prepare("SELECT * FROM users WHERE id='usr_legacy'").get() || null;
  const stamp = now();
  if (!user) {
    const userId = "usr_legacy";
    db.prepare("INSERT INTO users(id,email,display_name,role,created_at,updated_at,last_login_at) VALUES (?,?,?,'owner',?,?,?)")
      .run(userId, normalized, "Owner", stamp, stamp, stamp);
    user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  } else if (user.role !== "owner") {
    db.prepare("UPDATE users SET role='owner',last_login_at=?,updated_at=? WHERE id=?").run(stamp, stamp, user.id);
    user = { ...user, role: "owner" };
  }
  return publicUser(user);
};

export const createSession = (userId) => {
  const token = crypto.randomBytes(32).toString("base64url");
  const stamp = now();
  const expiresAt = new Date(Date.now() + env.sessionTtlHours * 3600 * 1000).toISOString();
  db.prepare("DELETE FROM user_sessions WHERE expires_at<=?").run(stamp);
  db.prepare("INSERT INTO user_sessions(id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)")
    .run(id("ses"), userId, tokenHash(token), expiresAt, stamp);
  return token;
};

export const readAccountSession = (token) => {
  if (!token) return null;
  const row = db.prepare(`SELECT u.* FROM user_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>?`).get(tokenHash(token), now());
  return publicUser(row);
};

export const deleteSession = (token) => {
  if (token) db.prepare("DELETE FROM user_sessions WHERE token_hash=?").run(tokenHash(token));
};

export const createOAuthState = (provider) => {
  const state = crypto.randomBytes(32).toString("base64url");
  const stamp = now();
  db.prepare("DELETE FROM oauth_states WHERE expires_at<=?").run(stamp);
  db.prepare("INSERT INTO oauth_states(state_hash,provider,expires_at,created_at) VALUES (?,?,?,?)")
    .run(tokenHash(state), provider, new Date(Date.now() + 10 * 60 * 1000).toISOString(), stamp);
  return state;
};

export const consumeOAuthState = (provider, state) => {
  const hash = tokenHash(String(state || ""));
  const row = db.prepare("SELECT * FROM oauth_states WHERE state_hash=? AND provider=? AND expires_at>?").get(hash, provider, now());
  if (!row) return false;
  db.prepare("DELETE FROM oauth_states WHERE state_hash=?").run(hash);
  return true;
};
