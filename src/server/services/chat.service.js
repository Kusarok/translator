import { providerRequest, buildStats, extractContent } from "./provider.service.js";
import { resolveRuntime } from "./runtime.service.js";
import { chatConfig } from "../config/chat.config.js";
import { HttpError } from "../utils/http-error.js";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const buildRequestBody = ({ model, messages, systemPrompt, settings, runtime }) => {
  const cfg = chatConfig.defaultSettings;
  const s = settings || {};

  // On the free tier the model is locked server-side and output tokens are capped.
  const requestedTokens = Number(s.maxCompletionTokens ?? cfg.maxCompletionTokens);
  const tokenCap = runtime.maxCompletionTokens ?? Infinity;

  const body = {
    model: runtime.lockModel ? runtime.model : (model || runtime.model),
    messages: [],
    temperature: clamp(Number(s.temperature ?? cfg.temperature), 0, 2),
    max_completion_tokens: Math.min(requestedTokens, tokenCap),
    top_p: clamp(Number(s.topP ?? cfg.topP), 0, 1)
  };

  if (systemPrompt && systemPrompt.trim()) {
    body.messages.push({ role: "system", content: systemPrompt.trim() });
  }

  for (const msg of messages) {
    body.messages.push(msg);
  }

  if (s.seed != null && s.seed !== "") {
    body.seed = Number(s.seed);
  }

  if (s.stop && String(s.stop).trim()) {
    body.stop = String(s.stop).trim();
  }

  if (s.format && s.format !== "text") {
    body.response_format = { type: s.format };
  }

  if (s.tools) {
    body.tools = s.tools;
  }

  return body;
};

const validateMessages = (messages, maxImages = chatConfig.maxImages) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HttpError(400, "Messages array is required");
  }

  if (messages.length > chatConfig.maxMessages) {
    throw new HttpError(413, `Too many messages (max ${chatConfig.maxMessages})`);
  }

  let imageCount = 0;

  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      throw new HttpError(400, "Each message must have role and content");
    }

    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "image_url") {
          imageCount++;
        }
      }
    }
  }

  if (imageCount > maxImages) {
    throw new HttpError(413, `Too many images (max ${maxImages})`);
  }
};

// Total length of all user-supplied text (message text parts + system prompt).
// Used to cap free-tier input so the shared key can't be drained with huge prompts.
const measureInputChars = (messages, systemPrompt) => {
  let total = String(systemPrompt || "").length;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      total += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part?.type === "text" && typeof part.text === "string") {
          total += part.text.length;
        }
      }
    }
  }
  return total;
};

export const sendChat = async ({ model, messages, systemPrompt, settings, provider, apiKey, authenticated }) => {
  const runtime = resolveRuntime({ provider, apiKey, model, authenticated });
  validateMessages(messages, runtime.maxImages ?? chatConfig.maxImages);

  // Free tier only: cap total input size so the shared key can't be drained with a giant
  // prompt. Owner/BYOK runtimes leave maxInputChars undefined and are unaffected.
  if (runtime.maxInputChars != null) {
    const inputChars = measureInputChars(messages, systemPrompt);
    if (inputChars > runtime.maxInputChars) {
      throw new HttpError(413, `Free chat input must be ${runtime.maxInputChars} characters or fewer. Add your own API key in Settings for longer conversations.`);
    }
  }
  const body = buildRequestBody({ model, messages, systemPrompt, settings, runtime });
  const { data, elapsedMs, provider: providerId } = await providerRequest(body, runtime);

  const content = extractContent(data);

  if (!content) {
    throw new HttpError(502, "Model returned an empty response");
  }

  const stats = buildStats(data, elapsedMs, body.model, providerId);

  return {
    message: {
      role: "assistant",
      content
    },
    ...stats
  };
};
