import { transcribeAudio } from "../services/transcription.service.js";
import { isOwnerAuthenticated } from "../services/auth.service.js";

export const transcribe = async (req, res) => {
  const result = await transcribeAudio({ ...req.body, authenticated: isOwnerAuthenticated(req) });

  res.json({
    text: result.text,
    language: result.language,
    duration: result.duration,
    segments: result.segments,
    model: result.model,
    timing: { elapsed_ms: result.elapsedMs }
  });
};
