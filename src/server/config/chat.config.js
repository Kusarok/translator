export const chatConfig = {
  defaultModel: "gemma-4-31b",
  defaultSystemPrompt: "",
  defaultSettings: {
    temperature: 1,
    maxCompletionTokens: 32768,
    topP: 0.95,
    format: "text",
    seed: null,
    stream: false,
    stop: null
  },
  maxImages: 5,
  maxImageSize: 10 * 1024 * 1024,
  maxMessages: 50,
  models: [
    { id: "gpt-oss-120b", label: "GPT-OSS 120B", vision: false },
    { id: "gemma-4-31b", label: "Gemma 4 31B", vision: true },
    { id: "zai-glm-4.7", label: "GLM 4.7", vision: false }
  ]
};
