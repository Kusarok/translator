import { hasPersianText } from "./constants.js";
import { elements } from "./dom.js";
import { state } from "./state.js";

export const setMessage = (text = "", type = "") => {
  elements.message.textContent = text;
  elements.message.className = `message ${type}`.trim();
};

export const setServerStatus = (text, type = "") => {
  elements.serverStatus.textContent = text;
  elements.serverStatus.className = `status-pill ${type}`.trim();
};

export const setLoadingView = (loading) => {
  elements.translateButton.disabled = loading;
  elements.translateButtonText.textContent = loading ? "در حال ترجمه" : "ترجمه";
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
  elements.modelName.textContent = "آماده";
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
  elements.statInput.textContent = usage?.prompt_tokens ?? "—";
  elements.statOutput.textContent = usage?.completion_tokens ?? "—";
  elements.statSpeed.textContent = timing?.tokens_per_second ?? "—";
  elements.statTime.textContent = timing?.elapsed_ms ?? "—";
  elements.statsBar.hidden = false;
};

export const resetStats = () => {
  elements.statsBar.hidden = true;
};

export const applyHealth = () => {
  populateModelSelect(state.models, state.selectedModel);
  updateCharacterCount();
};
