import { getHealth, translate, transcribeWithProgress } from "./api.js";
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
  addProgressBubble,
  setProgress,
  clearMessages,
  hasMessages,
  flashCopied,
  initScrollAwareTopbar
} from "./ui.js";
import { initLangPicker } from "./langpicker.js";
import { initChat, onLanguageChange, refreshChatConfig, refreshChatAccess } from "./chat-app.js";
import { initSettings, refreshOwnerSection } from "./settings.js";
import { initByokUi, refreshByokUi } from "./byok-ui.js";
import { getRuntime, getRequestPayload, updateModel } from "./byok.js";
import { initLive, stopLive, setLiveAvailable, refreshLiveAvailability, applyLiveTranslations } from "./live.js";
import { initViewportSizing } from "./viewport.js";

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

  // Recompute the scroll-aware topbar shadow from the now-visible list (scroll events alone
  // never fire on a view switch, so the shadow would otherwise go stale across tabs).
  const activeList = views[view]?.querySelector(".messages");
  document.querySelector(".topbar")?.classList.toggle("scrolled", (activeList?.scrollTop || 0) > 4);

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

  const source = elements.sourceLanguage.value;
  const target = elements.targetLanguage.value;
  // Two-way conversation mode is on whenever the source is Auto-detect: a reply typed in the
  // target language is translated back into the other party's language automatically.
  const conversation = source === "auto";

  try {
    const result = await translate({
      text,
      sourceLanguage: source,
      targetLanguage: target,
      model: elements.modelSelect.value,
      tone: elements.toneSelect.value,
      ...(conversation ? { conversation: true, counterpart: state.conversationCounterpart } : {}),
      ...getRequestPayload()
    });

    removeLoadingBubble();
    lastTranslation = result.translation;

    // Learn the other party's language from the first non-target message, so their subsequent
    // target-language replies route back to it without any settings change.
    if (conversation && result.detectedLanguage && result.detectedLanguage !== target &&
        state.conversationCounterpart !== result.detectedLanguage) {
      state.conversationCounterpart = result.detectedLanguage;
      updateDirectionLabel();
    }

    const direction = conversation ? { detected: result.detectedLanguage, target: result.targetLanguage } : null;
    addBubble("assistant", result.translation, buildResultMeta(result, direction));
  } catch (error) {
    removeLoadingBubble();
    addErrorBubble(error.message || t("msgError"));
  } finally {
    setLoading(false);
    setLoadingView(false);
    elements.inputText.focus();
  }
};

// The counterpart pole is only valid for the current language pairing; forget it whenever the
// user changes the languages or clears the conversation.
const resetConversation = () => {
  state.conversationCounterpart = "";
  updateDirectionLabel();
};

// ---- Audio / song transcription (Groq Whisper) ----

// The /api/transcribe route accepts a 30 MB JSON body; 20 MB of audio base64-encodes to ~27 MB.
const MAX_AUDIO_SIZE = 20 * 1024 * 1024;

const readFileAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const formatTimestamp = (sec) => {
  if (sec == null || !Number.isFinite(sec)) return "";
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const withTimestamps = (segments) =>
  segments.map((seg) => `[${formatTimestamp(seg.start)}] ${seg.text}`).join("\n");

// Re-attach each segment's timestamp to the matching translated line. Falls back to the raw
// translation if the model didn't return one line per input line.
const pairTranslation = (segments, translation) => {
  const lines = String(translation || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (segments.length && lines.length === segments.length) {
    return segments.map((seg, i) => `[${formatTimestamp(seg.start)}] ${lines[i]}`).join("\n");
  }
  return String(translation || "").trim();
};

const handleAudioFile = async (file) => {
  if (!file) return;

  if (!file.type.startsWith("audio/")) {
    setMessage(t("audioTypeError"), "error");
    return;
  }
  if (file.size > MAX_AUDIO_SIZE) {
    setMessage(t("audioTooLarge"), "error");
    return;
  }

  setLoading(true);
  setLoadingView(true);
  setMessage("");

  addBubble("user", `\u{1F3B5} ${file.name}`);
  addProgressBubble(t("audioPreparing"));

  try {
    const dataUri = await readFileAsDataURL(file);
    // Transcription uses the server-side Groq key (owner/free tier); do NOT forward the chat
    // BYOK key here — it belongs to a different provider and Groq would reject it. Upload
    // progress is surfaced live; once the body is fully sent we wait on Groq (indeterminate).
    const stt = await transcribeWithProgress(
      { audio: dataUri, filename: file.name, mimeType: file.type },
      (loaded, total) => {
        if (!total) return;
        if (loaded >= total) {
          setProgress(t("audioTranscribing"), null);
        } else {
          setProgress(t("audioUploading", { percent: Math.round((loaded / total) * 100) }), loaded / total);
        }
      }
    );
    removeLoadingBubble();

    const segments = stt.segments || [];
    const transcript = segments.length ? withTimestamps(segments) : (stt.text || "");

    if (!transcript.trim()) {
      addErrorBubble(t("audioEmpty"));
      return;
    }

    const sttMeta = [t("audioTranscript"), stt.language, formatTimestamp(stt.duration)].filter(Boolean).join(" · ");
    addBubble("assistant", transcript, sttMeta);

    // Translate the transcript with the song/audio prompt, defaulting to Gemma 4.
    const source = segments.length ? segments.map((s) => s.text).join("\n") : stt.text;
    addProgressBubble(t("audioTranslating"));
    const result = await translate({
      text: source,
      sourceLanguage: "auto",
      targetLanguage: elements.targetLanguage.value,
      model: elements.modelSelect.value,
      tone: elements.toneSelect.value,
      mode: "audio",
      ...getRequestPayload()
    });
    removeLoadingBubble();

    const paired = pairTranslation(segments, result.translation);
    lastTranslation = paired;
    addBubble("assistant", paired, buildResultMeta(result));
  } catch (error) {
    removeLoadingBubble();
    addErrorBubble(error.message || t("msgError"));
  } finally {
    setLoading(false);
    setLoadingView(false);
    elements.audioInput.value = "";
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
  resetConversation();
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

  elements.sourceLanguage.addEventListener("change", () => {
    syncTargetWithSource();
    resetConversation();
  });
  elements.targetLanguage.addEventListener("change", () => {
    updateDirectionLabel();
    resetConversation();
  });
  elements.swapButton.addEventListener("click", () => {
    swapLanguages();
    resetConversation();
  });
  elements.clearButton.addEventListener("click", clearAll);
  elements.copyLastButton.addEventListener("click", copyLast);

  elements.modelSelect.addEventListener("change", () => {
    const runtime = getRuntime();
    if (runtime) updateModel(runtime.provider, elements.modelSelect.value);
  });

  if (elements.audioButton && elements.audioInput) {
    elements.audioButton.addEventListener("click", () => elements.audioInput.click());
    elements.audioInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) handleAudioFile(file);
    });
  }

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

initViewportSizing();
bindEvents();
initTheme();
populateLanguageSelects();
initLangPicker(elements);
initScrollAwareTopbar();
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
