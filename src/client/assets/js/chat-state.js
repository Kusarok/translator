const SESSION_KEY = "chatSessionId";

const generateSessionId = () => {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const chatState = {
  sessionId: localStorage.getItem(SESSION_KEY) || generateSessionId(),
  messages: [],
  model: "gemma-4-31b",
  systemPrompt: "",
  settings: {
    temperature: 1,
    maxCompletionTokens: 32768,
    topP: 0.95,
    format: "text",
    seed: null,
    stream: false,
    stop: null,
    tools: null
  },
  pendingImages: [],
  loading: false,
  config: null
};

if (!localStorage.getItem(SESSION_KEY)) {
  localStorage.setItem(SESSION_KEY, chatState.sessionId);
}

export const setChatConfig = (config) => {
  chatState.config = config;
  if (config?.defaultModel) chatState.model = config.defaultModel;
  if (config?.defaultSystemPrompt != null) chatState.systemPrompt = config.defaultSystemPrompt;
  if (config?.defaultSettings) {
    chatState.settings = { ...chatState.settings, ...config.defaultSettings };
  }
};

export const setChatLoading = (value) => {
  chatState.loading = Boolean(value);
};

export const addChatMessage = (message) => {
  chatState.messages.push(message);
};

export const clearChatMessages = () => {
  chatState.messages = [];
};

export const addPendingImage = (image) => {
  chatState.pendingImages.push(image);
};

export const clearPendingImages = () => {
  chatState.pendingImages = [];
};
