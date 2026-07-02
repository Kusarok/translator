import { cerebrasRequest, buildStats } from "./cerebras.service.js";
import { chatConfig } from "../config/chat.config.js";
import { HttpError } from "../utils/http-error.js";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const buildRequestBody = ({ model, messages, systemPrompt, settings }) => {
  const cfg = chatConfig.defaultSettings;
  const s = settings || {};

  const body = {
    model: model || chatConfig.defaultModel,
    messages: [],
    temperature: clamp(Number(s.temperature ?? cfg.temperature), 0, 2),
    max_completion_tokens: Number(s.maxCompletionTokens ?? cfg.maxCompletionTokens),
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

const validateMessages = (messages) => {
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

  if (imageCount > chatConfig.maxImages) {
    throw new HttpError(413, `Too many images (max ${chatConfig.maxImages})`);
  }
};

export const sendChat = async ({ model, messages, systemPrompt, settings }) => {
  validateMessages(messages);

  const body = buildRequestBody({ model, messages, systemPrompt, settings });
  const { data, elapsedMs } = await cerebrasRequest(body);

  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new HttpError(502, "Model returned an empty response");
  }

  const stats = buildStats(data, elapsedMs, body.model);

  return {
    message: {
      role: "assistant",
      content
    },
    ...stats
  };
};
