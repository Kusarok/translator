import { translateText } from "../services/translation.service.js";
import { isOwnerAuthenticated } from "../services/auth.service.js";

export const translate = async (req, res) => {
  const result = await translateText({ ...req.body, authenticated: isOwnerAuthenticated(req) });

  res.json({
    translation: result.text,
    model: result.model,
    usage: result.usage,
    timing: result.timing,
    detectedLanguage: result.detected || null,
    targetLanguage: result.resolvedTarget || null
  });
};
