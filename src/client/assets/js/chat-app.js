import { sendChatMessage } from "./chat-api.js";
import { chatEl } from "./chat-dom.js";
import {
  chatState,
  setChatConfig,
  setChatLoading,
  addChatMessage,
  clearChatMessages,
  addPendingImage,
  clearPendingImages
} from "./chat-state.js";
import {
  addMessage,
  addLoadingBubble,
  removeLoadingBubble,
  showImagePreview,
  clearImagePreview,
  setChatLoading as setUILoading,
  clearMessages,
  showSettings,
  hideSettings,
  populateChatModelSelect,
  saveSettingsFromForm,
  updateSliderDisplay,
  applySettingsToForm,
  applyChatTranslations
} from "./chat-ui.js";
import { t, getLang } from "./i18n.js";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGES = 5;
const VALID_TYPES = ["image/png", "image/jpeg"];

const readImageAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const buildMessageContent = (text, images) => {
  if (images.length === 0) {
    return text;
  }

  const parts = [];
  if (text.trim()) {
    parts.push({ type: "text", text });
  }
  for (const img of images) {
    parts.push({ type: "image_url", image_url: { url: img.dataUri } });
  }
  return parts;
};

const handleImageSelect = async (files) => {
  const fileArr = Array.from(files);

  for (const file of fileArr) {
    if (!VALID_TYPES.includes(file.type)) {
      alert(t("chatImgTypeError"));
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      alert(t("chatImgTooLarge"));
      return;
    }
  }

  if (chatState.pendingImages.length + fileArr.length > MAX_IMAGES) {
    alert(t("chatImgMaxError"));
    return;
  }

  const visionModel = chatState.config?.models?.find((m) => m.vision);
  if (visionModel && chatState.config?.models) {
    const currentModel = chatState.config.models.find((m) => m.id === chatState.model);
    if (currentModel && !currentModel.vision) {
      chatState.model = visionModel.id;
      populateChatModelSelect(chatState.config.models, chatState.model);
    }
  }

  for (const file of fileArr) {
    const dataUri = await readImageAsDataURL(file);
    addPendingImage({ dataUri, name: file.name });
  }

  showImagePreview(chatState.pendingImages);
};

const removeImage = (index) => {
  chatState.pendingImages.splice(index, 1);
  showImagePreview(chatState.pendingImages);
};

const handleSend = async () => {
  const text = chatEl.input.value.trim();
  const images = [...chatState.pendingImages];

  if (!text && images.length === 0) {
    return;
  }

  const content = buildMessageContent(text, images);
  const userMessage = { role: "user", content };

  addChatMessage(userMessage);
  addMessage("user", content);

  chatEl.input.value = "";
  clearPendingImages();
  clearImagePreview();

  const apiMessages = [...chatState.messages];

  setChatLoading(true);
  setUILoading(true);
  addLoadingBubble();

  try {
    const result = await sendChatMessage({
      model: chatState.model,
      messages: apiMessages,
      systemPrompt: chatState.systemPrompt,
      settings: chatState.settings
    }, chatState.sessionId);

    removeLoadingBubble();

    const assistantMessage = { role: "assistant", content: result.message.content };
    addChatMessage(assistantMessage);
    addMessage("assistant", result.message.content);
  } catch (error) {
    removeLoadingBubble();
    addMessage("assistant", error.message || "Error");
  } finally {
    setChatLoading(false);
    setUILoading(false);
    chatEl.input.focus();
  }
};

const handleClearChat = () => {
  if (chatState.messages.length === 0) return;
  if (!confirm(t("chatClearConfirm"))) return;
  clearChatMessages();
  clearMessages();
};

const handleSettingsSave = () => {
  saveSettingsFromForm();
  hideSettings();
};

export const initChat = (chatConfig) => {
  setChatConfig(chatConfig);

  if (chatConfig?.models) {
    populateChatModelSelect(chatConfig.models, chatState.model);
  }

  applySettingsToForm();
  applyChatTranslations();
  bindChatEvents();
};

const bindChatEvents = () => {
  chatEl.sendButton.addEventListener("click", handleSend);

  chatEl.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  chatEl.imageButton.addEventListener("click", () => {
    chatEl.imageInput.click();
  });

  chatEl.imageInput.addEventListener("change", () => {
    handleImageSelect(chatEl.imageInput.files);
    chatEl.imageInput.value = "";
  });

  chatEl.imagePreview.addEventListener("click", (e) => {
    if (e.target.classList.contains("img-preview-remove")) {
      removeImage(parseInt(e.target.dataset.index, 10));
    }
  });

  chatEl.clearButton.addEventListener("click", handleClearChat);
  chatEl.settingsButton.addEventListener("click", showSettings);
  chatEl.settingsClose.addEventListener("click", hideSettings);
  chatEl.settingsSave.addEventListener("click", handleSettingsSave);

  chatEl.temperature.addEventListener("input", updateSliderDisplay);
  chatEl.topP.addEventListener("input", updateSliderDisplay);

  chatEl.settingsPanel.addEventListener("click", (e) => {
    if (e.target === chatEl.settingsPanel) hideSettings();
  });
};

export const onLanguageChange = () => {
  applyChatTranslations();
};
