import { WebSocketServer, WebSocket } from "ws";
import { getProviderRuntime } from "./settings.store.js";
import { isOwnerAuthenticated } from "./auth.service.js";

const GOOGLE_LIVE_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const LIVE_MODEL = "models/gemini-3.5-live-translate-preview";

const sendJson = (socket, payload) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
};

const handleGoogleMessage = (client, raw, state) => {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }

  if (message.setupComplete) {
    state.ready = true;
    sendJson(client, { type: "ready" });
    return;
  }

  const content = message.serverContent;
  if (!content) {
    if (message.goAway) sendJson(client, { type: "info", message: "session ending" });
    return;
  }

  if (content.inputTranscription?.text) {
    sendJson(client, { type: "input", text: content.inputTranscription.text });
  }
  if (content.outputTranscription?.text) {
    sendJson(client, { type: "output", text: content.outputTranscription.text });
  }

  for (const part of content.modelTurn?.parts || []) {
    if (part.inlineData?.data && client.readyState === WebSocket.OPEN) {
      client.send(Buffer.from(part.inlineData.data, "base64"));
    }
  }

  if (content.turnComplete || content.generationComplete) {
    sendJson(client, { type: "turn" });
  }
};

const openGoogle = (client, state, config, authenticated) => {
  const byokKey = String(config.apiKey || "").trim();
  const apiKey = byokKey || (authenticated ? getProviderRuntime("google").apiKey : "");

  if (!apiKey) {
    sendJson(client, { type: "error", message: "No Google API key. Add your own key, or log in as the owner." });
    return;
  }

  const google = new WebSocket(`${GOOGLE_LIVE_URL}?key=${encodeURIComponent(apiKey)}`);
  state.google = google;

  google.on("open", () => {
    google.send(JSON.stringify({
      setup: {
        model: LIVE_MODEL,
        generationConfig: {
          responseModalities: ["AUDIO"],
          translationConfig: {
            targetLanguageCode: config.targetLanguage || "en",
            echoTargetLanguage: config.echo !== false
          }
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {}
      }
    }));
  });

  google.on("message", (data) => handleGoogleMessage(client, data.toString(), state));
  google.on("error", (err) => sendJson(client, { type: "error", message: err.message || "Live connection failed" }));
  google.on("close", (code, reason) => {
    sendJson(client, { type: "closed", code, reason: reason?.toString() || "" });
    try { client.close(); } catch {}
  });
};

export const attachLiveSocket = (server) => {
  const wss = new WebSocketServer({ server, path: "/api/live" });

  wss.on("connection", (client, request) => {
    const authenticated = isOwnerAuthenticated({ headers: request.headers });
    const state = { google: null, ready: false };

    const shutdown = () => {
      try { state.google?.close(); } catch {}
      try { client.close(); } catch {}
    };

    client.on("message", (data, isBinary) => {
      if (isBinary) {
        if (state.google && state.ready && state.google.readyState === WebSocket.OPEN) {
          state.google.send(JSON.stringify({
            realtimeInput: {
              audio: { data: data.toString("base64"), mimeType: "audio/pcm;rate=16000" }
            }
          }));
        }
        return;
      }

      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (message.type === "start" && !state.google) {
        openGoogle(client, state, message, authenticated);
      } else if (message.type === "stop") {
        shutdown();
      }
    });

    client.on("close", shutdown);
    client.on("error", shutdown);
  });
};
