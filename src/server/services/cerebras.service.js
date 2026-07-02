import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

const parseErrorMessage = async (response) => {
  const text = await response.text();

  if (!text) {
    return response.statusText || "Cerebras request failed";
  }

  try {
    const data = JSON.parse(text);
    return data.error?.message || data.message || text;
  } catch {
    return text;
  }
};

export const cerebrasRequest = async (body) => {
  if (!env.cerebrasApiKey) {
    throw new HttpError(500, "Cerebras API key is not configured");
  }

  const startedAt = performance.now();

  const response = await fetch(`${env.cerebrasBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.cerebrasApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new HttpError(response.status, await parseErrorMessage(response));
  }

  const data = await response.json();
  const elapsedMs = performance.now() - startedAt;

  return { data, elapsedMs };
};

export const buildStats = (data, elapsedMs, fallbackModel) => {
  const usage = data.usage || {};
  const completionTokens = usage.completion_tokens || 0;
  const tokensPerSecond = elapsedMs > 0
    ? Math.round((completionTokens / (elapsedMs / 1000)) * 10) / 10
    : 0;

  return {
    model: data.model || fallbackModel,
    usage: {
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: completionTokens,
      total_tokens: usage.total_tokens || 0,
      image_tokens: usage.image_tokens || 0
    },
    timing: {
      elapsed_ms: Math.round(elapsedMs),
      tokens_per_second: tokensPerSecond
    }
  };
};

export const createChatCompletion = async (messages, model) => {
  const selectedModel = model || env.cerebrasModel;
  const { data, elapsedMs } = await cerebrasRequest({
    model: selectedModel,
    messages,
    temperature: 0.2,
    max_completion_tokens: 4000
  });

  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new HttpError(502, "Cerebras returned an empty translation");
  }

  const stats = buildStats(data, elapsedMs, selectedModel);

  return {
    text: content,
    ...stats
  };
};
