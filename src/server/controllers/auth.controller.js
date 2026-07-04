import { verifyCredentials, setSessionCookie, clearSessionCookie } from "../services/auth.service.js";
import { HttpError } from "../utils/http-error.js";

export const unlock = (req, res) => {
  const { username, password } = req.body || {};

  if (!verifyCredentials({ username, password })) {
    throw new HttpError(401, "Incorrect username or password.");
  }

  setSessionCookie(res, req);
  res.json({ ok: true });
};

export const logout = (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
};
