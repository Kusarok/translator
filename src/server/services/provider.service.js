import { HttpError } from "../utils/http-error.js";
import { providerMap } from "../config/providers.js";
import { getProviderRuntime } from "./settings.store.js";

const friendly = (status, raw) => {
  const message = String(raw || "");
  if (status === 429 || /quota|rate.?limit|exceeded/i.test(message)) {
    return "Rate limit or free-tier quota reached. Wait a moment, pick another model, or switch provider.";
  }
  if (status === 401 || status === 403 || /api key|unauthor|permission/i.test(message)) {
    return "The API key was rejected. Open Settings and check the key for this provider.";
  }
  if (/does not exist|do not have access|not found|unsupported/i.test(message)) {
    return "This model is unavailable right now (often a free-tier quota limit). Pick another model or provider.";
  }
  if (message.length > 200) {
    return `${message.slice(0, 200)}…`;
  }
  return message;
};

const parseErrorMessage = async (response) => {
  const text = await response.text();

  if (!text) {
    return friendly(response.status, response.statusText || "Provider request failed");
  }

  try {
    const data = JSON.parse(text);
    const parsed = Array.isArray(data) ? data[0] : data;
    const raw = parsed?.error?.message || parsed?.error || parsed?.message || text;
    return friendly(response.status, typeof raw === "string" ? raw : JSON.stringify(raw));
  } catch {
    return friendly(response.status, text);
  }
};

const normalizeBody = (body, runtime) => {
  if (runtime.tokenParam === "max_completion_tokens") {
    return body;
  }
  if (body.max_completion_tokens == null) {
    return body;
  }
  const { max_completion_tokens, ...rest } = body;
  return { ...rest, [runtime.tokenParam]: max_completion_tokens };
};

const stripReasoning = (text) =>
  String(text || "")
    .replace(/<(thought|think|reasoning)>[\s\S]*?<\/\1>/gi, "")
    .trim();

export const providerRequest = async (body, runtime) => {
  if (!runtime.apiKey) {
    throw new HttpError(400, `API key is not configured for ${runtime.id}. Open Settings to add one.`);
  }

  const startedAt = performance.now();

  const response = await fetch(`${runtime.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${runtime.apiKey}`,
      "Content-Type": "application/json",
      ...runtime.extraHeaders
    },
    body: JSON.stringify(normalizeBody(body, runtime))
  });

  if (!response.ok) {
    throw new HttpError(response.status, await parseErrorMessage(response));
  }

  const data = await response.json();
  const elapsedMs = performance.now() - startedAt;

  return { data, elapsedMs, provider: runtime.id };
};

export const buildStats = (data, elapsedMs, fallbackModel, provider) => {
  const usage = data.usage || {};
  const completionTokens = usage.completion_tokens || 0;
  const tokensPerSecond = elapsedMs > 0
    ? Math.round((completionTokens / (elapsedMs / 1000)) * 10) / 10
    : 0;

  return {
    provider,
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

export const extractContent = (data) => stripReasoning(data.choices?.[0]?.message?.content);

export const createChatCompletion = async (messages, model, runtime) => {
  const selectedModel = model || runtime.model;

  const { data, elapsedMs, provider } = await providerRequest({
    model: selectedModel,
    messages,
    temperature: 0.2,
    max_completion_tokens: 4000
  }, runtime);

  const content = extractContent(data);

  if (!content) {
    throw new HttpError(502, "The model returned an empty translation");
  }

  return {
    text: content,
    ...buildStats(data, elapsedMs, selectedModel, provider)
  };
};

export const testProvider = async ({ providerId, apiKey, model, authenticated }) => {
  const provider = providerMap[providerId];
  if (!provider) {
    throw new HttpError(400, `Unknown provider: ${providerId}`);
  }

  const cleanKey = String(apiKey || "").trim();

  if (!cleanKey && !authenticated) {
    throw new HttpError(401, "Provide an API key to test, or log in as the owner to test the saved key.");
  }

  const runtime = getProviderRuntime(providerId);
  const key = cleanKey || runtime.apiKey;

  if (!key) {
    throw new HttpError(400, "An API key is required to test the connection");
  }

  const testModel = model || runtime.model;
  const body = normalizeBody({
    model: testModel,
    messages: [{ role: "user", content: "ping" }],
    temperature: 0,
    max_completion_tokens: 5
  }, runtime);

  const response = await fetch(`${runtime.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      ...runtime.extraHeaders
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new HttpError(response.status, await parseErrorMessage(response));
  }

  const data = await response.json();
  return { ok: true, provider: providerId, model: data.model || testModel };
};
