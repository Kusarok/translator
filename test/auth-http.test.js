import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const port = 18800 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const root = fs.mkdtempSync(path.join(os.tmpdir(), "translator-auth-"));
let child;

const wait = async () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { const response = await fetch(`${base}/api/health`); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("auth test server did not start");
};

test.before(async () => {
  child = spawn(process.execPath, ["src/server/index.js"], {
    cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORTS: String(port), APP_DATA_DIR: root }, stdio: "ignore"
  });
  await wait();
});

test.after(async () => {
  if (child?.exitCode === null) { child.kill("SIGTERM"); await new Promise((resolve) => child.once("exit", resolve)); }
  fs.rmSync(root, { recursive: true, force: true });
});

test("users can register, receive a private session, and sign out", async () => {
  const signedOut = await fetch(`${base}/api/health`);
  assert.equal((await signedOut.json()).auth.authenticated, false);

  const registration = await fetch(`${base}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "listener@example.com", password: "correct-horse", displayName: "Listener" })
  });
  assert.equal(registration.status, 201);
  const cookie = registration.headers.get("set-cookie").split(";", 1)[0];
  const payload = await registration.json();
  assert.equal(payload.user.displayName, "Listener");

  const signedIn = await fetch(`${base}/api/health`, { headers: { Cookie: cookie } });
  const health = await signedIn.json();
  assert.equal(health.auth.authenticated, true);
  assert.equal(health.auth.user.email, "listener@example.com");

  const logout = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
  assert.equal(logout.status, 200);
});

test("a repeated Google callback returns an authenticated browser to the app", async () => {
  const registration = await fetch(`${base}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "oauth-repeat@example.com", password: "correct-horse", displayName: "OAuth Listener" })
  });
  assert.equal(registration.status, 201);
  const cookie = registration.headers.get("set-cookie").split(";", 1)[0];

  const callback = await fetch(`${base}/api/auth/google/callback?state=already-used&code=already-used`, {
    headers: { Cookie: cookie },
    redirect: "manual"
  });

  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("location"), "/?auth=google_success");
});
