import { getHealth, translate } from "./api.js";
import { elements } from "./dom.js";
import { languages } from "./constants.js";
import { setHealth, setLoading, state } from "./state.js";
import { t } from "./i18n.js";
import {
  applyHealth,
  initTheme,
  setTheme,
  setLanguage,
  setLoadingView,
  setMessage,
  setServerStatus,
  updateCharacterCount,
  updateDirection,
  updateDirectionLabel,
  autoGrowInput,
  populateLanguageSelects,
  buildResultMeta,
  addBubble,
  addErrorBubble,
  addLoadingBubble,
  removeLoadingBubble,
  clearMessages,
  hasMessages,
  flashCopied
} from "./ui.js";
import { initChat, onLanguageChange, refreshChatConfig, refreshChatAccess } from "./chat-app.js";
import { initSettings, refreshOwnerSection } from "./settings.js";
import { initByokUi, refreshByokUi } from "./byok-ui.js";
import { getRuntime, getRequestPayload, updateModel } from "./byok.js";
import { initLive, stopLive, setLiveAvailable, refreshLiveAvailability, applyLiveTranslations } from "./live.js";

const menuTabs = document.querySelectorAll(".mode-option");
const modeBtn = document.querySelector("#modeBtn");
const modeMenu = document.querySelector("#modeMenu");
const modeIcon = document.querySelector("#modeIcon");
const modeLabel = document.querySelector("#modeLabel");
const views = {
  translator: document.querySelector("#translatorView"),
  chat: document.querySelector("#chatView"),
  live: document.querySelector("#liveView")
};

let lastTranslation = "";

const closeModeMenu = () => {
  modeMenu.classList.remove("open");
  modeBtn.setAttribute("aria-expanded", "false");
};

const switchView = (view) => {
  if (view !== "live") stopLive();
  for (const [name, el] of Object.entries(views)) {
    if (el) el.hidden = name !== view;
  }
  document.body.dataset.mode = view;

  let activeTab = null;
  menuTabs.forEach((tab) => {
    const isActive = tab.dataset.view === view;
    tab.classList.toggle("active", isActive);
    if (isActive) activeTab = tab;
  });

  if (activeTab) {
    modeIcon.textContent = activeTab.dataset.icon;
    const labelSpan = activeTab.querySelector("[data-i18n]");
    if (labelSpan) {
      modeLabel.dataset.i18n = labelSpan.dataset.i18n;
      modeLabel.textContent = labelSpan.textContent;
    }
  }
};

let chatReady = false;

const loadHealth = async () => {
  try {
    const health = await getHealth();
    setHealth(health);
    applyHealth();
    updateDirectionLabel();
    setLiveAvailable(health.live?.available);
    setServerStatus("online");
    refreshOwnerSection();
    refreshByokUi();
    if (health.chat) {
      if (!chatReady) {
        initChat(health.chat);
        chatReady = true;
      } else {
        refreshChatConfig(health.chat);
      }
    }
  } catch (error) {
    setServerStatus("offline", "error");
    setMessage(error.message, "error");
  }
};

const refreshAccessAfterKeyChange = () => {
  applyHealth();
  refreshChatAccess();
  refreshLiveAvailability();
};

const translateText = async () => {
  const text = elements.inputText.value.trim();

  if (!text) {
    setMessage(t("msgEmpty"), "warning");
    return;
  }

  if (text.length > state.maxTextLength) {
    setMessage(t("msgTooLong", { max: state.maxTextLength }), "error");
    return;
  }

  setLoading(true);
  setLoadingView(true);
  setMessage("");

  addBubble("user", text);
  elements.inputText.value = "";
  updateDirection(elements.inputText);
  autoGrowInput();
  updateCharacterCount();
  addLoadingBubble();

  try {
    const result = await translate({
      text,
      sourceLanguage: elements.sourceLanguage.value,
      targetLanguage: elements.targetLanguage.value,
      model: elements.modelSelect.value,
      tone: elements.toneSelect.value,
      ...getRequestPayload()
    });

    removeLoadingBubble();
    lastTranslation = result.translation;
    addBubble("assistant", result.translation, buildResultMeta(result));
  } catch (error) {
    removeLoadingBubble();
    addErrorBubble(error.message || t("msgError"));
  } finally {
    setLoading(false);
    setLoadingView(false);
    elements.inputText.focus();
  }
};

const writeClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
};

const copyBubble = async (bubble) => {
  const text = bubble.copyText || "";
  if (!text) return;
  await writeClipboard(text);
  flashCopied(bubble);
  setMessage(t("msgCopied"));
};

const copyLast = async () => {
  if (!lastTranslation) {
    setMessage(t("msgNothingToCopy"), "warning");
    return;
  }
  await writeClipboard(lastTranslation);
  setMessage(t("msgCopied"));
};

const clearAll = () => {
  if (hasMessages() && !confirm(t("trClearConfirm"))) return;
  clearMessages();
  lastTranslation = "";
  elements.inputText.value = "";
  updateDirection(elements.inputText);
  autoGrowInput();
  updateCharacterCount();
  setMessage("");
  elements.inputText.focus();
};

const firstOtherLanguage = (exclude) =>
  (languages.find((lang) => lang.code !== "auto" && lang.code !== exclude) || {}).code;

const swapLanguages = () => {
  const source = elements.sourceLanguage.value;
  const target = elements.targetLanguage.value;

  elements.sourceLanguage.value = target;
  elements.targetLanguage.value = source === "auto" ? firstOtherLanguage(target) : source;
  updateDirectionLabel();
};

const syncTargetWithSource = () => {
  const source = elements.sourceLanguage.value;

  if (source !== "auto" && source === elements.targetLanguage.value) {
    elements.targetLanguage.value = firstOtherLanguage(source);
  }

  updateDirectionLabel();
};

const bindEvents = () => {
  elements.translateButton.addEventListener("click", translateText);

  elements.inputText.addEventListener("input", () => {
    updateCharacterCount();
    updateDirection(elements.inputText);
    autoGrowInput();
  });

  elements.inputText.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      translateText();
    }
  });

  elements.sourceLanguage.addEventListener("change", syncTargetWithSource);
  elements.targetLanguage.addEventListener("change", updateDirectionLabel);
  elements.swapButton.addEventListener("click", swapLanguages);
  elements.clearButton.addEventListener("click", clearAll);
  elements.copyLastButton.addEventListener("click", copyLast);

  elements.modelSelect.addEventListener("change", () => {
    const runtime = getRuntime();
    if (runtime) updateModel(runtime.provider, elements.modelSelect.value);
  });

  if (elements.keyBannerButton) {
    elements.keyBannerButton.addEventListener("click", () => elements.settingsToggle.click());
  }

  elements.messages.addEventListener("click", (event) => {
    const bubble = event.target.closest(".msg-copyable");
    if (bubble) copyBubble(bubble);
  });

  elements.messages.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const bubble = event.target.closest(".msg-copyable");
    if (!bubble) return;
    event.preventDefault();
    copyBubble(bubble);
  });

  elements.serverStatus.addEventListener("click", loadHealth);

  modeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = modeMenu.classList.toggle("open");
    modeBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  document.addEventListener("click", closeModeMenu);

  menuTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      switchView(tab.dataset.view);
      closeModeMenu();
    });
  });

  document.querySelectorAll("#themeSeg .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => setTheme(btn.dataset.themeVal));
  });

  document.querySelectorAll("#langSeg .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLanguage(btn.dataset.langVal);
      onLanguageChange();
      applyLiveTranslations();
    });
  });
};

bindEvents();
initTheme();
populateLanguageSelects();
setLanguage(localStorage.getItem("lang") || "en");
switchView("translator");
initSettings(loadHealth);
initByokUi(refreshAccessAfterKeyChange);
initLive();
loadHealth();
updateCharacterCount();
updateDirection(elements.inputText);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
