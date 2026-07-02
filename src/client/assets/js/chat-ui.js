import { chatEl } from "./chat-dom.js";
import { chatState } from "./chat-state.js";
import { t, translations, getLang } from "./i18n.js";

const escapeHtml = (text) => {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
};

const renderContent = (content) => {
  if (typeof content === "string") {
    return `<p class="msg-text">${escapeHtml(content).replace(/\n/g, "<br>")}</p>`;
  }

  if (Array.isArray(content)) {
    let html = "";
    for (const part of content) {
      if (part.type === "text" && part.text) {
        html += `<p class="msg-text">${escapeHtml(part.text).replace(/\n/g, "<br>")}</p>`;
      } else if (part.type === "image_url" && part.image_url?.url) {
        html += `<img class="msg-image" src="${part.image_url.url}" alt="image">`;
      }
    }
    return html;
  }

  return "";
};

export const addMessage = (role, content) => {
  if (chatEl.emptyState) {
    chatEl.emptyState.hidden = true;
  }

  const bubble = document.createElement("div");
  bubble.className = `msg-bubble msg-${role}`;

  const time = new Date().toLocaleTimeString(getLang() === "fa" ? "fa-IR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit"
  });

  bubble.innerHTML = renderContent(content) + `<span class="msg-time">${time}</span>`;

  const wrapper = document.createElement("div");
  wrapper.className = `msg-row msg-row-${role}`;
  wrapper.appendChild(bubble);

  chatEl.messagesArea.appendChild(wrapper);
  chatEl.messagesArea.scrollTop = chatEl.messagesArea.scrollHeight;

  return wrapper;
};

export const addLoadingBubble = () => {
  if (chatEl.emptyState) {
    chatEl.emptyState.hidden = true;
  }

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble msg-assistant msg-loading";
  bubble.id = "chatLoadingBubble";
  bubble.innerHTML = '<span class="chat-typing"><span></span><span></span><span></span></span>';

  const wrapper = document.createElement("div");
  wrapper.className = "msg-row msg-row-assistant";
  wrapper.appendChild(bubble);

  chatEl.messagesArea.appendChild(wrapper);
  chatEl.messagesArea.scrollTop = chatEl.messagesArea.scrollHeight;
};

export const removeLoadingBubble = () => {
  const el = document.getElementById("chatLoadingBubble");
  if (el?.parentElement) {
    el.parentElement.remove();
  }
};

export const showImagePreview = (images) => {
  chatEl.imagePreview.innerHTML = "";
  chatEl.imagePreview.hidden = images.length === 0;

  images.forEach((img, index) => {
    const container = document.createElement("div");
    container.className = "img-preview-item";

    const imgEl = document.createElement("img");
    imgEl.src = img.dataUri;
    imgEl.alt = "preview";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "img-preview-remove";
    removeBtn.textContent = "\u2715";
    removeBtn.dataset.index = index;

    container.appendChild(imgEl);
    container.appendChild(removeBtn);
    chatEl.imagePreview.appendChild(container);
  });
};

export const clearImagePreview = () => {
  chatEl.imagePreview.innerHTML = "";
  chatEl.imagePreview.hidden = true;
};

export const setChatLoading = (loading) => {
  chatEl.sendButton.disabled = loading;
  chatEl.input.disabled = loading;
};

export const clearMessages = () => {
  chatEl.messagesArea.innerHTML = "";
  if (chatEl.emptyState) {
    chatEl.messagesArea.appendChild(chatEl.emptyState);
    chatEl.emptyState.hidden = false;
  }
};

export const showSettings = () => {
  applySettingsToForm();
  chatEl.settingsPanel.hidden = false;
};

export const hideSettings = () => {
  chatEl.settingsPanel.hidden = true;
};

export const populateChatModelSelect = (models, selected) => {
  chatEl.modelSelect.innerHTML = "";

  for (const model of models) {
    const option = document.createElement("option");
    option.value = model.id;
    const visionTag = model.vision ? ` \u{1f4f7}` : "";
    option.textContent = `${model.label}${visionTag}`;
    chatEl.modelSelect.appendChild(option);
  }

  chatEl.modelSelect.value = selected;
  updateChatBotName();
};

export const updateChatBotName = () => {
  if (!chatEl.botName) return;
  const opt = chatEl.modelSelect.options[chatEl.modelSelect.selectedIndex];
  chatEl.botName.textContent = opt ? opt.textContent : "AI";
};

export const applySettingsToForm = () => {
  const s = chatState.settings;
  chatEl.modelSelect.value = chatState.model;
  chatEl.systemPrompt.value = chatState.systemPrompt;
  chatEl.temperature.value = s.temperature;
  chatEl.temperatureValue.textContent = Number(s.temperature).toFixed(1);
  chatEl.maxTokens.value = s.maxCompletionTokens;
  chatEl.topP.value = s.topP;
  chatEl.topPValue.textContent = Number(s.topP).toFixed(2);
  chatEl.format.value = s.format || "text";
  chatEl.seed.value = s.seed ?? "";
  chatEl.stream.checked = Boolean(s.stream);
  chatEl.stop.value = s.stop || "";
  chatEl.functions.value = s.tools ? JSON.stringify(s.tools, null, 2) : "";
};

export const saveSettingsFromForm = () => {
  chatState.model = chatEl.modelSelect.value;
  chatState.systemPrompt = chatEl.systemPrompt.value;

  const seedRaw = chatEl.seed.value.trim();
  const toolsRaw = chatEl.functions.value.trim();

  chatState.settings = {
    temperature: parseFloat(chatEl.temperature.value),
    maxCompletionTokens: parseInt(chatEl.maxTokens.value, 10) || 32768,
    topP: parseFloat(chatEl.topP.value),
    format: chatEl.format.value,
    seed: seedRaw ? parseInt(seedRaw, 10) : null,
    stream: chatEl.stream.checked,
    stop: chatEl.stop.value.trim() || null,
    tools: toolsRaw ? (() => { try { return JSON.parse(toolsRaw); } catch { return null; } })() : null
  };
};

export const updateSliderDisplay = () => {
  chatEl.temperatureValue.textContent = parseFloat(chatEl.temperature.value).toFixed(1);
  chatEl.topPValue.textContent = parseFloat(chatEl.topP.value).toFixed(2);
};

export const applyChatTranslations = () => {
  const tr = translations[getLang()];
  const set = (el, key) => { if (el) el.textContent = tr[key]; };
  const setPh = (el, key) => { if (el) el.placeholder = tr[key]; };

  if (chatEl.input) chatEl.input.placeholder = tr.chatPlaceholder;
  setPh(chatEl.systemPrompt, "chatSystemPromptPh");
  setPh(chatEl.seed, "chatSeedPh");
  setPh(chatEl.stop, "chatStopPh");
  setPh(chatEl.functions, "chatFunctionsPh");
  if (chatEl.emptyState) chatEl.emptyState.textContent = tr.chatNoMessages;
  updateChatBotName();

  document.querySelectorAll("[data-chat-i18n]").forEach((el) => {
    el.textContent = tr[el.dataset.chatI18n];
  });

  document.querySelectorAll("[data-chat-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", tr[el.dataset.chatI18nAria]);
  });
};
