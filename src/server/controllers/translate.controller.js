import { translateText } from "../services/translation.service.js";

export const translate = async (req, res) => {
  const result = await translateText(req.body || {});

  res.json({
    translation: result.text,
    model: result.model,
    usage: result.usage
  });
};
