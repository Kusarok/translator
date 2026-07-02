import { sendChat } from "../services/chat.service.js";

export const chat = async (req, res) => {
  const sessionId = req.headers["x-session-id"] || null;

  const result = await sendChat(req.body || {});

  res.json({
    ...result,
    sessionId
  });
};
