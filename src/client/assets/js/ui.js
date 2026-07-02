import { hasPersianText } from "./constants.js";
import { elements } from "./dom.js";
import { state } from "./state.js";
import { translations, t, setLang, getLang } from "./i18n.js";

const formatTime = (ms) =>
  ms == null ? "—" : (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

const formatNumber = (n) =>
  n == null ? "—" : (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

const applyTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme);
  elements.themeToggle.textContent = theme === "dark" ? "\u2600\ufe0f" : "\u{1f319}";
  localStorage.setItem("theme", theme);
};

export const initTheme = () => {
  const saved = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));
};

initTheme.toggle = () => {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current === "dark" ? "light" : "dark");
};

const updateSelectOptions = (lang) => {
  const tr = translations[lang];
  const src = elements.sourceLanguage.options;
  src[0].textContent = tr.autoDetect;
  src[1].textContent = tr.persian;
  src[2].textContent = tr.english;

  const tgt = elements.targetLanguage.options;
  tgt[0].textContent = tr.english;
  tgt[1].textContent = tr.persian;

  const tone = elements.toneSelect.options;
  tone[0].textContent = tr.toneDefault;
  tone[1].textContent = tr.toneFormal;
  tone[2].textContent = tr.toneInformal;
  tone[3].textContent = tr.toneTechnical;
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
  elements.langToggle.textContent = lang === "fa" ? "EN" : "FA";
  updateCharacterCount();
};

setLanguage.toggle = () => {
  setLanguage(getLang() === "fa" ? "en" : "fa");
};

export const setMessage = (text = "", type = "") => {
  elements.message.textContent = text;
  elements.message.className = `message ${type}`.trim();
};

export const setServerStatus = (statusKey, type = "") => {
  elements.serverStatus.textContent = t(statusKey);
  elements.serverStatus.className = `status-pill ${type}`.trim();
};

export const setLoadingView = (loading) => {
  elements.translateButton.disabled = loading;
  elements.translateButtonText.textContent = loading ? t("translating") : t("translate");
  elements.form.classList.toggle("is-loading", loading);
};

export const updateCharacterCount = () => {
  const length = elements.inputText.value.length;
  elements.characterCount.textContent = `${length} / ${state.maxTextLength}`;
  elements.characterCount.classList.toggle("over-limit", length > state.maxTextLength);
};

export const updateDirection = (element) => {
  const value = element.value || element.textContent || "";
  element.dir = hasPersianText(value) ? "rtl" : "ltr";
};

export const setOutput = (text) => {
  elements.outputText.value = text;
  updateDirection(elements.outputText);
};

export const resetOutput = () => {
  setOutput("");
  elements.modelName.textContent = t("ready");
};

export const populateModelSelect = (models, selected) => {
  elements.modelSelect.innerHTML = "";

  for (const model of models) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.label;
    elements.modelSelect.appendChild(option);
  }

  elements.modelSelect.value = selected;
};

export const setStats = ({ model, usage, timing }) => {
  elements.statModel.textContent = model || "—";
  elements.statInput.textContent = formatNumber(usage?.prompt_tokens);
  elements.statOutput.textContent = formatNumber(usage?.completion_tokens);
  elements.statSpeed.textContent = timing?.tokens_per_second ?? "—";
  elements.statTime.textContent = formatTime(timing?.elapsed_ms);
  elements.statsBar.hidden = false;
};

export const resetStats = () => {
  elements.statsBar.hidden = true;
};

export const applyHealth = () => {
  populateModelSelect(state.models, state.selectedModel);
  updateCharacterCount();
};
