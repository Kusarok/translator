import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";
import { authenticateAccount, consumeOAuthState, createAccount, createOAuthState, findOrCreateGoogleAccount } from "../services/account.store.js";
import { clearSessionCookie, googleLoginEnabled, legacyOwnerLogin, readSession, setSessionCookie } from "../services/auth.service.js";
import { HttpError } from "../utils/http-error.js";

const googleClient = () => new OAuth2Client(env.googleClientId, env.googleClientSecret, env.googleRedirectUri);

export const session = (req, res) => res.json({
  authenticated: Boolean(readSession(req)),
  user: readSession(req),
  googleEnabled: googleLoginEnabled()
});

export const register = async (req, res) => {
  let user;
  try { user = await createAccount(req.body || {}); }
  catch (error) { throw new HttpError(400, error.message); }
  setSessionCookie(res, req, user);
  res.status(201).json({ ok: true, user });
};

export const login = async (req, res) => {
  const user = await authenticateAccount(req.body || {});
  if (!user) throw new HttpError(401, "Email or password is incorrect.");
  setSessionCookie(res, req, user);
  res.json({ ok: true, user });
};

export const unlock = (req, res) => {
  const user = legacyOwnerLogin(req.body || {});
  if (!user) throw new HttpError(401, "Incorrect owner username or password.");
  setSessionCookie(res, req, user);
  res.json({ ok: true, user });
};

export const googleStart = (_req, res) => {
  if (!googleLoginEnabled()) throw new HttpError(503, "Google sign-in is not configured yet.");
  const state = createOAuthState("google");
  res.redirect(googleClient().generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account"
  }));
};

export const googleCallback = async (req, res) => {
  if (!googleLoginEnabled()) throw new HttpError(503, "Google sign-in is not configured yet.");
  if (!consumeOAuthState("google", req.query.state)) throw new HttpError(400, "This sign-in request expired. Please try again.");
  if (!req.query.code) return res.redirect("/?auth=google_cancelled");
  const client = googleClient();
  const { tokens } = await client.getToken(String(req.query.code));
  if (!tokens.id_token) throw new HttpError(401, "Google did not return an identity token.");
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.googleClientId });
  const profile = ticket.getPayload();
  if (!profile?.sub || !profile.email || profile.email_verified !== true) throw new HttpError(401, "A verified Google email is required.");
  const user = findOrCreateGoogleAccount({
    subject: profile.sub,
    email: profile.email,
    displayName: profile.name,
    avatarUrl: profile.picture
  });
  setSessionCookie(res, req, user);
  res.redirect("/?auth=google_success");
};

export const logout = (req, res) => {
  clearSessionCookie(res, req);
  res.json({ ok: true });
};
