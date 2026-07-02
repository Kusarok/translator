import { getHealth, translate } from "./api.js";
import { elements } from "./dom.js";
import { oppositeLanguage } from "./constants.js";
import { setHealth, setLoading, state } from "./state.js";
import {
  applyHealth,
  resetOutput,
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
    setServerStatus("آنلاین");
  } catch (error) {
    setServerStatus("آفلاین", "error");
    setMessage(error.message, "error");
  }
};

const translateText = async () => {
  const text = elements.inputText.value.trim();

  if (!text) {
    setMessage("متن را وارد کنید.", "warning");
    return;
  }

  if (text.length > state.maxTextLength) {
    setMessage(`متن باید حداکثر ${state.maxTextLength} کاراکتر باشد.`, "error");
    return;
  }

  setLoading(true);
  setLoadingView(true);
  setMessage("");
  resetOutput();

  try {
    const result = await translate({
      text,
      sourceLanguage: elements.sourceLanguage.value,
      targetLanguage: elements.targetLanguage.value
    });

    setOutput(result.translation);
    elements.modelName.textContent = result.model || state.model;
    setMessage("انجام شد.");
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
    setMessage("متن وارد شد.");
  } catch {
    setMessage("Paste در این مرورگر در دسترس نیست.", "warning");
  }
};

const copyOutput = async () => {
  const text = elements.outputText.value;

  if (!text) {
    setMessage("متنی برای کپی وجود ندارد.", "warning");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setMessage("کپی شد.");
  } catch {
    elements.outputText.select();
    document.execCommand("copy");
    setMessage("کپی شد.");
  }
};

const clearAll = () => {
  elements.inputText.value = "";
  resetOutput();
  updateCharacterCount();
  updateDirection(elements.inputText);
  setMessage("");
  elements.inputText.focus();
};

const swapLanguages = () => {
  const source = elements.sourceLanguage.value;
  const target = elements.targetLanguage.value;

  elements.sourceLanguage.value = source === "auto" ? target : target;
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
  elements.pasteButton.addEventListener("click", pasteText);
  elements.copyButton.addEventListener("click", copyOutput);
  elements.clearButton.addEventListener("click", clearAll);
  elements.swapButton.addEventListener("click", swapLanguages);
};

bindEvents();
loadHealth();
updateCharacterCount();
updateDirection(elements.inputText);
