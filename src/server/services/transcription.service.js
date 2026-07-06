import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

// Groq's free tier caps uploads at 25 MB; we also bound decoded size defensively.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const friendly = (status, raw) => {
  const message = String(raw || "");
  if (status === 429 || /quota|rate.?limit|exceeded/i.test(message)) {
    return "Groq rate limit or quota reached. Wait a moment and try again.";
  }
  if (status === 401 || status === 403 || /api key|unauthor|permission/i.test(message)) {
    return "The Groq API key was rejected. Check GROQ_API_KEY on the server.";
  }
  if (status === 413 || /too large|maximum|file size/i.test(message)) {
    return "The audio file is too large for transcription (max 25 MB).";
  }
  return message.length > 200 ? `${message.slice(0, 200)}…` : (message || "Transcription failed");
};

const parseErrorMessage = async (response) => {
  const text = await response.text();
  if (!text) return friendly(response.status, response.statusText || "Transcription failed");
  try {
    const data = JSON.parse(text);
    const raw = data?.error?.message || data?.error || data?.message || text;
    return friendly(response.status, typeof raw === "string" ? raw : JSON.stringify(raw));
  } catch {
    return friendly(response.status, text);
  }
};

// Accepts either a data URI ("data:audio/mpeg;base64,AAAA…") or bare base64.
const decodeAudio = (audio) => {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(String(audio || ""));
  const mime = match ? match[1] : "";
  const b64 = match ? match[2] : String(audio || "");
  return { buffer: Buffer.from(b64, "base64"), mime };
};

export const transcribeAudio = async ({ audio, filename, mimeType, apiKey, authenticated }) => {
  if (!audio) {
    throw new HttpError(400, "Audio is required");
  }

  const { buffer, mime } = decodeAudio(audio);
  if (!buffer.length) {
    throw new HttpError(400, "Audio could not be decoded");
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new HttpError(413, "The audio file is too large (max 25 MB).");
  }

  // Key resolution mirrors the app's philosophy: a caller-supplied Groq key wins; otherwise
  // the server-side GROQ_API_KEY is used for the owner, and for anonymous visitors only when
  // the free tier is switched on (route-level rate limiting bounds abuse of the shared key).
  const clientKey = String(apiKey || "").trim();
  if (!clientKey && !authenticated && (!env.freeTierEnabled || !env.groqApiKey)) {
    throw new HttpError(401, "Log in as the owner or provide a Groq API key to transcribe audio.");
  }
  const key = clientKey || env.groqApiKey;
  if (!key) {
    throw new HttpError(401, "Transcription is not configured (no Groq API key on the server).");
  }

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType || mime || "audio/mpeg" }), filename || "audio");
  form.append("model", env.groqSttModel);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("temperature", "0");

  const startedAt = performance.now();
  const response = await fetch(`${env.groqBaseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}` },
    body: form
  });

  if (!response.ok) {
    throw new HttpError(response.status, await parseErrorMessage(response));
  }

  const data = await response.json();
  const segments = Array.isArray(data.segments)
    ? data.segments
        .map((s) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text || "").trim() }))
        .filter((s) => s.text)
    : [];

  return {
    text: String(data.text || "").trim(),
    language: data.language || "",
    duration: data.duration ?? null,
    segments,
    model: env.groqSttModel,
    elapsedMs: Math.round(performance.now() - startedAt)
  };
};
