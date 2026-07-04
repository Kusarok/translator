import { testConnection } from "./api.js";
import { elements } from "./dom.js";
import { state } from "./state.js";
import { t } from "./i18n.js";
import * as byok from "./byok.js";

let onChange = () => {};

const savedBadge = (providerId) => {
  const saved = Boolean(byok.getEntry(providerId)?.apiKey);
  return saved
    ? `<span class="provider-badge ok">${t("providerConfigured")}</span>`
    : `<span class="provider-badge missing">${t("providerNotConfigured")}</span>`;
};

const updateFreeNote = () => {
  const note = document.getElementById("freeTierNote");
  if (!note) return;
  // Show the free-tier note only while it actually applies: free tier is on and the
  // visitor has not selected their own key yet.
  if (byok.freeTierAvailable() && !byok.getRuntime()) {
    note.hidden = false;
    note.textContent = t("freeTierNote")
      .replace("{model}", state.free?.model || "Gemma")
      .replace("{limit}", String(state.free?.rateLimit ?? 5));
  } else {
    note.hidden = true;
  }
};

const render = () => {
  updateFreeNote();
  if (!elements.byokList) return;
  const activeProvider = byok.getActiveProvider();

  elements.byokList.innerHTML = state.catalog.map((provider) => {
    const entry = byok.getEntry(provider.id);
    const hasKey = Boolean(entry?.apiKey);
    const isActive = provider.id === activeProvider && hasKey;
    const useButton = isActive
      ? `<span class="provider-inuse">✓ ${t("inUse")}</span>`
      : `<button type="button" class="provider-use" data-action="use" ${hasKey ? "" : "disabled"}>${t("useProvider")}</button>`;
    const removeButton = hasKey
      ? `<button type="button" class="provider-use ghost" data-action="remove">${t("byokRemove")}</button>`
      : "";

    return `
      <div class="provider-item ${isActive ? "is-active" : ""}" data-provider="${provider.id}">
        <div class="provider-head">
          <span class="provider-name">${provider.label}</span>
          <span class="provider-badges">
            ${isActive ? `<span class="provider-badge active">${t("providerActive")}</span>` : ""}
            ${savedBadge(provider.id)}
          </span>
        </div>
        <div class="provider-key-row">
          <input type="password" class="provider-key" autocomplete="off" spellcheck="false" placeholder="${t("apiKeyPlaceholder")}">
          <button type="button" class="provider-save" data-action="save">${t("saveKey")}</button>
          <button type="button" class="provider-test" data-action="test">${t("testConnection")}</button>
        </div>
        <div class="provider-foot">
          <span class="provider-foot-actions">${useButton}${removeButton}</span>
          <p class="provider-status" role="status"></p>
        </div>
      </div>
    `;
  }).join("");
};

const setStatus = (providerId, text, type) => {
  const el = elements.byokList.querySelector(`.provider-item[data-provider="${providerId}"] .provider-status`);
  if (!el) return;
  el.textContent = text;
  el.className = `provider-status ${type || ""}`.trim();
};

const handleListClick = async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const item = button.closest(".provider-item");
  const providerId = item.dataset.provider;
  const input = item.querySelector(".provider-key");
  const apiKey = input.value.trim();
  const action = button.dataset.action;

  button.disabled = true;

  try {
    if (action === "save") {
      if (!apiKey) {
        setStatus(providerId, t("keyRequired"), "error");
        button.disabled = false;
        return;
      }
      const existing = byok.getEntry(providerId);
      byok.saveEntry(providerId, { apiKey, model: existing?.model || "" });
      render();
      setStatus(providerId, t("keySaved"), "ok");
      onChange();
      return;
    }

    if (action === "test") {
      const keyToTest = apiKey || byok.getEntry(providerId)?.apiKey;
      if (!keyToTest) {
        setStatus(providerId, t("keyRequired"), "error");
        button.disabled = false;
        return;
      }
      setStatus(providerId, t("testing"), "");
      const result = await testConnection({ provider: providerId, apiKey: keyToTest });
      setStatus(providerId, `${t("connectionOk")} (${result.model})`, "ok");
      button.disabled = false;
      return;
    }

    if (action === "use") {
      byok.setActiveProvider(providerId);
      render();
      const label = state.catalog.find((p) => p.id === providerId)?.label || providerId;
      setStatus(providerId, t("providerSwitched").replace("{label}", label), "ok");
      onChange();
      return;
    }

    if (action === "remove") {
      byok.removeEntry(providerId);
      render();
      onChange();
      return;
    }
  } catch (error) {
    setStatus(providerId, `${t("connectionFailed")}: ${error.message}`, "error");
    button.disabled = false;
  }
};

export const refreshByokUi = () => render();

export const initByokUi = (onChangeCallback) => {
  onChange = typeof onChangeCallback === "function" ? onChangeCallback : () => {};
  if (elements.byokList) {
    elements.byokList.addEventListener("click", handleListClick);
  }
  render();
};
