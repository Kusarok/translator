import { sendChat } from "../services/chat.service.js";
import { isOwnerAuthenticated } from "../services/auth.service.js";

export const chat = async (req, res) => {
  const sessionId = req.headers["x-session-id"] || null;

  const result = await sendChat({ ...req.body, authenticated: isOwnerAuthenticated(req) });

  res.json({
    ...result,
    sessionId
  });
};
