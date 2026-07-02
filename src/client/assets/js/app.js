import { getHealth, translate } from "./api.js";
import { elements } from "./dom.js";
import { oppositeLanguage } from "./constants.js";
import { setHealth, setLoading, state } from "./state.js";
import { t } from "./i18n.js";
import {
  applyHealth,
  initTheme,
  resetOutput,
  resetStats,
  setLanguage,
  setStats,
  setLoadingView,
  setMessage,
  setOutput,
  setServerStatus,
  updateCharacterCount,
  updateDirection
} from "./ui.js";

const loadHealth = async () => {
  try {
    const health = await getHealth();
    setHealth(health);
    applyHealth();
    setServerStatus("online");
  } catch (error) {
    setServerStatus("offline", "error");
    setMessage(error.message, "error");
  }
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
  resetOutput();
  resetStats();

  try {
    const result = await translate({
      text,
      sourceLanguage: elements.sourceLanguage.value,
      targetLanguage: elements.targetLanguage.value,
      model: elements.modelSelect.value,
      tone: elements.toneSelect.value
    });

    setOutput(result.translation);
    elements.modelName.textContent = result.model || elements.modelSelect.value;
    setStats(result);
    setMessage(t("msgDone"));
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setLoading(false);
    setLoadingView(false);
  }
};

const pasteText = async () => {
  try {
    const text = await navigator.clipboard.readText();
    elements.inputText.value = text;
    updateDirection(elements.inputText);
    updateCharacterCount();
    setMessage(t("msgPasted"));
  } catch {
    setMessage(t("msgPasteFail"), "warning");
  }
};

const copyOutput = async () => {
  const text = elements.outputText.value;

  if (!text) {
    setMessage(t("msgNothingToCopy"), "warning");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setMessage(t("msgCopied"));
  } catch {
    elements.outputText.select();
    document.execCommand("copy");
    setMessage(t("msgCopied"));
  }
};

const clearAll = () => {
  elements.inputText.value = "";
  resetOutput();
  resetStats();
  updateCharacterCount();
  updateDirection(elements.inputText);
  setMessage("");
  elements.inputText.focus();
};

const swapLanguages = () => {
  const source = elements.sourceLanguage.value;
  const target = elements.targetLanguage.value;

  elements.sourceLanguage.value = target;
  elements.targetLanguage.value = source === "auto" ? oppositeLanguage[target] : source;

  const input = elements.inputText.value;
  const output = elements.outputText.value;

  if (output) {
    elements.inputText.value = output;
    setOutput(input);
    updateCharacterCount();
    updateDirection(elements.inputText);
  }
};

const syncTargetWithSource = () => {
  const source = elements.sourceLanguage.value;

  if (source === "fa") {
    elements.targetLanguage.value = "en";
  }

  if (source === "en") {
    elements.targetLanguage.value = "fa";
  }
};

const bindEvents = () => {
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    translateText();
  });

  elements.inputText.addEventListener("input", () => {
    updateCharacterCount();
    updateDirection(elements.inputText);
  });

  elements.sourceLanguage.addEventListener("change", syncTargetWithSource);
  elements.inputText.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      translateText();
    }
  });
  elements.pasteButton.addEventListener("click", pasteText);
  elements.copyButton.addEventListener("click", copyOutput);
  elements.clearButton.addEventListener("click", clearAll);
  elements.swapButton.addEventListener("click", swapLanguages);
  elements.themeToggle.addEventListener("click", initTheme.toggle);
  elements.langToggle.addEventListener("click", setLanguage.toggle);
};

bindEvents();
initTheme();
setLanguage(localStorage.getItem("lang") || "fa");
loadHealth();
updateCharacterCount();
updateDirection(elements.inputText);
