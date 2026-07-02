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

export const createChatCompletion = async (messages) => {
  if (!env.cerebrasApiKey) {
    throw new HttpError(500, "Cerebras API key is not configured");
  }

  const response = await fetch(`${env.cerebrasBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.cerebrasApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.cerebrasModel,
      messages,
      temperature: 0.2,
      max_completion_tokens: 4000
    })
  });

  if (!response.ok) {
    throw new HttpError(response.status, await parseErrorMessage(response));
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new HttpError(502, "Cerebras returned an empty translation");
  }

  return {
    text: content,
    model: data.model || env.cerebrasModel,
    usage: data.usage || null
  };
};
