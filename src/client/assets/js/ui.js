import { hasRtlText, languages, languageMap } from "./constants.js";
import { elements } from "./dom.js";
import { state } from "./state.js";
import { translations, t, setLang, getLang } from "./i18n.js";
import { getRuntime, hasUsableKey, isFreeMode } from "./byok.js";

// The one model the free tier exposes, resolved from the server-reported catalog.
export const freeModelList = () => {
  const provider = state.catalog.find((entry) => entry.id === state.free?.provider);
  const model = provider?.models.find((m) => m.id === state.free?.model);
  const fallback = { id: state.free?.model || "gemma-4-31b", label: "Gemma 4", vision: true };
  return [model || fallback];
};

const formatTime = (ms) =>
  ms == null ? null : (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

const updateThemeSeg = (theme) => {
  document.querySelectorAll("#themeSeg .seg-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeVal === theme);
  });
};

const applyTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  updateThemeSeg(theme);
};

export const initTheme = () => {
  applyTheme(localStorage.getItem("theme") || "dark");
};

export const setTheme = (theme) => applyTheme(theme);

const buildLangOptions = (select, includeAuto) => {
  select.innerHTML = "";
  for (const lang of languages) {
    if (lang.code === "auto" && !includeAuto) continue;
    const option = document.createElement("option");
    option.value = lang.code;
    option.textContent = lang.code === "auto" ? t("autoDetect") : lang.native;
    select.appendChild(option);
  }
};

export const populateLanguageSelects = () => {
  const source = elements.sourceLanguage.value || "auto";
  const target = elements.targetLanguage.value || "en";
  buildLangOptions(elements.sourceLanguage, true);
  buildLangOptions(elements.targetLanguage, false);
  elements.sourceLanguage.value = source;
  elements.targetLanguage.value = target;
};

const updateSelectOptions = (lang) => {
  const tr = translations[lang];
  const autoOption = elements.sourceLanguage.options[0];
  if (autoOption && autoOption.value === "auto") autoOption.textContent = tr.autoDetect;

  const tone = elements.toneSelect.options;
  tone[0].textContent = tr.toneDefault;
  tone[1].textContent = tr.toneFormal;
  tone[2].textContent = tr.toneInformal;
  tone[3].textContent = tr.toneTechnical;
};

const languageLabel = (code) => {
  if (code === "auto") return translations[getLang()].autoDetect;
  return languageMap[code]?.native ?? code;
};

export const updateDirectionLabel = () => {
  elements.direction.textContent =
    `${languageLabel(elements.sourceLanguage.value)} → ${languageLabel(elements.targetLanguage.value)}`;
};

export const setLanguage = (lang) => {
  setLang(lang);
  const tr = translations[lang];

  document.documentElement.lang = lang;
  document.documentElement.dir = tr.dir;
  document.title = tr.title;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = tr[el.dataset.i18n];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = tr[el.dataset.i18nPlaceholder];
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", tr[el.dataset.i18nAria]);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = tr[el.dataset.i18nTitle];
  });

  updateSelectOptions(lang);
  updateDirectionLabel();
  document.querySelectorAll("#langSeg .seg-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.langVal === lang);
  });
  updateCharacterCount();
};

export const setMessage = (text = "", type = "") => {
  elements.message.textContent = text;
  elements.message.className = `message ${type}`.trim();
};

export const setServerStatus = (statusKey, type = "") => {
  const pill = elements.serverStatus;
  const text = pill.querySelector(".status-text");
  if (text) text.textContent = t(statusKey);
  pill.classList.remove("online", "error");
  if (statusKey === "online") pill.classList.add("online");
  if (type === "error") pill.classList.add("error");
};

export const updateKeyGate = () => {
  const available = hasUsableKey();
  if (elements.keyBanner) elements.keyBanner.hidden = available;
  elements.translateButton.disabled = !available || state.loading;
};

export const setLoadingView = (loading) => {
  elements.inputText.disabled = loading;
  updateKeyGate();
};

export const updateCharacterCount = () => {
  const length = elements.inputText.value.length;
  elements.characterCount.textContent = `${length} / ${state.maxTextLength}`;
  elements.characterCount.classList.toggle("over-limit", length > state.maxTextLength);
};

export const updateDirection = (element) => {
  const value = element.value || element.textContent || "";
  element.dir = hasRtlText(value) ? "rtl" : "ltr";
};

export const autoGrowInput = () => {
  elements.inputText.style.height = "auto";
  elements.inputText.style.height = `${Math.min(elements.inputText.scrollHeight, 120)}px`;
};

export const populateModelSelect = (models, selected) => {
  elements.modelSelect.innerHTML = "";

  for (const model of models) {
    const option = document.createElement("option");
    option.value = model.id;
    const visionTag = model.vision ? " \u{1f4f7}" : "";
    option.textContent = `${model.label}${visionTag}`;
    elements.modelSelect.appendChild(option);
  }

  elements.modelSelect.value = selected;
  const single = models.length <= 1;
  elements.modelSelect.hidden = single;
  const section = document.getElementById("modelSection");
  if (section) section.hidden = single;
};

const effectiveModels = () => {
  if (isFreeMode()) {
    const models = freeModelList();
    return { models, selected: models[0].id };
  }
  const runtime = getRuntime();
  const catalogEntry = runtime ? state.catalog.find((provider) => provider.id === runtime.provider) : null;
  if (!catalogEntry) return { models: state.models, selected: state.selectedModel };

  const selected = runtime.model && catalogEntry.models.some((m) => m.id === runtime.model)
    ? runtime.model
    : catalogEntry.models[0]?.id;
  return { models: catalogEntry.models, selected };
};

export const applyHealth = () => {
  const { models, selected } = effectiveModels();
  populateModelSelect(models, selected);
  updateCharacterCount();
  updateKeyGate();
};

// ---- Conversation bubbles ----

const escapeHtml = (text) => {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
};

const nowTime = () =>
  new Date().toLocaleTimeString(getLang() === "fa" ? "fa-IR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit"
  });

export const buildResultMeta = ({ model, timing }) => {
  const parts = [];
  if (model) parts.push(model);
  if (timing?.tokens_per_second != null) parts.push(`${timing.tokens_per_second} ${t("statSpeed")}`);
  const time = formatTime(timing?.elapsed_ms);
  if (time) parts.push(time);
  return parts.join(" · ");
};

const hideEmptyState = () => {
  if (elements.emptyState) elements.emptyState.hidden = true;
};

const appendRow = (role, bubble) => {
  const row = document.createElement("div");
  row.className = `msg-row msg-row-${role}`;
  row.appendChild(bubble);
  elements.messages.appendChild(row);
  elements.messages.scrollTop = elements.messages.scrollHeight;
  return bubble;
};

export const addBubble = (role, text, meta) => {
  hideEmptyState();

  const bubble = document.createElement("div");
  bubble.className = `msg-bubble msg-${role} msg-copyable`;
  bubble.dir = hasRtlText(text) ? "rtl" : "ltr";
  bubble.copyText = text;
  bubble.setAttribute("role", "button");
  bubble.setAttribute("tabindex", "0");
  bubble.title = t("clickToCopy");

  let inner = `<p class="msg-text">${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
  if (meta) inner += `<span class="msg-meta">${escapeHtml(meta)}</span>`;
  inner += `<span class="msg-time">${nowTime()}</span>`;
  bubble.innerHTML = inner;

  return appendRow(role, bubble);
};

export const addErrorBubble = (text) => {
  hideEmptyState();

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble msg-assistant msg-error";
  bubble.innerHTML =
    `<p class="msg-text">${escapeHtml(text)}</p><span class="msg-time">${nowTime()}</span>`;

  return appendRow("assistant", bubble);
};

export const addLoadingBubble = () => {
  hideEmptyState();

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble msg-assistant msg-loading";
  bubble.id = "translatorLoadingBubble";
  bubble.innerHTML = '<span class="chat-typing"><span></span><span></span><span></span></span>';

  appendRow("assistant", bubble);
};

export const removeLoadingBubble = () => {
  const el = document.getElementById("translatorLoadingBubble");
  if (el?.parentElement) el.parentElement.remove();
};

export const clearMessages = () => {
  elements.messages.innerHTML = "";
  if (elements.emptyState) {
    elements.messages.appendChild(elements.emptyState);
    elements.emptyState.hidden = false;
  }
};

export const hasMessages = () => Boolean(elements.messages.querySelector(".msg-row"));

export const flashCopied = (bubble) => {
  if (!bubble) return;
  bubble.classList.add("msg-copied");
  setTimeout(() => bubble.classList.remove("msg-copied"), 1000);
};
