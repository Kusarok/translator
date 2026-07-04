export const providerCatalog = [
  {
    id: "cerebras",
    label: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    envKey: "CEREBRAS_API_KEY",
    envBaseUrl: "CEREBRAS_BASE_URL",
    tokenParam: "max_completion_tokens",
    defaultModel: "gemma-4-31b",
    models: [
      { id: "gpt-oss-120b", label: "GPT-OSS 120B", vision: false },
      { id: "gemma-4-31b", label: "Gemma 4 31B", vision: true },
      { id: "zai-glm-4.7", label: "GLM 4.7", vision: false }
    ]
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
    envBaseUrl: "OPENROUTER_BASE_URL",
    tokenParam: "max_tokens",
    defaultModel: "openrouter/free",
    extraHeaders: {
      "HTTP-Referer": "https://github.com/translator",
      "X-Title": "Translator"
    },
    models: [
      { id: "openrouter/free", label: "Free Models (auto)", vision: true }
    ]
  },
  {
    id: "google",
    label: "Google AI Studio",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    envKey: "GOOGLE_API_KEY",
    envBaseUrl: "GOOGLE_BASE_URL",
    tokenParam: "max_tokens",
    defaultModel: "gemma-4-31b-it",
    models: [
      { id: "gemma-4-31b-it", label: "Gemma 4 31B", vision: true },
      { id: "gemini-flash-lite-latest", label: "Gemini Flash Lite (latest)", vision: true },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", vision: true },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", vision: true },
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", vision: true }
    ]
  }
];

export const providerMap = Object.fromEntries(
  providerCatalog.map((provider) => [provider.id, provider])
);

export const publicModels = (provider) =>
  provider.models.map(({ id, label, vision }) => ({ id, label, vision }));
