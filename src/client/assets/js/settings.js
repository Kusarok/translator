import { getSettings, updateSettings, testConnection, unlockOwner, logoutOwner } from "./api.js";
import { elements } from "./dom.js";
import { state } from "./state.js";
import { t } from "./i18n.js";

let current = { activeProvider: "", providers: [] };
let onChange = () => {};

const statusBadge = (provider) => {
  if (!provider.configured) {
    return `<span class="provider-badge missing">${t("providerNotConfigured")}</span>`;
  }
  const key = provider.fromEnv ? "providerFromEnv" : "providerConfigured";
  return `<span class="provider-badge ok">${t(key)}</span>`;
};

const renderProviders = () => {
  elements.providerList.innerHTML = current.providers.map((provider) => {
    const isActive = provider.id === current.activeProvider;
    const footer = isActive
      ? `<span class="provider-inuse">✓ ${t("inUse")}</span>`
      : `<button type="button" class="provider-use" data-action="use" ${provider.configured ? "" : "disabled"}>${t("useProvider")}</button>`;

    return `
      <div class="provider-item ${isActive ? "is-active" : ""}" data-provider="${provider.id}">
        <div class="provider-head">
          <span class="provider-name">${provider.label}</span>
          <span class="provider-badges">
            ${isActive ? `<span class="provider-badge active">${t("providerActive")}</span>` : ""}
            ${statusBadge(provider)}
          </span>
        </div>
        <div class="provider-key-row">
          <input type="password" class="provider-key" autocomplete="off" spellcheck="false" placeholder="${t("apiKeyPlaceholder")}">
          <button type="button" class="provider-save" data-action="save">${t("saveKey")}</button>
          <button type="button" class="provider-test" data-action="test">${t("testConnection")}</button>
        </div>
        <div class="provider-foot">
          ${footer}
          <p class="provider-status" role="status"></p>
        </div>
      </div>
    `;
  }).join("");
};

const renderLocked = () => {
  elements.providerList.innerHTML = state.catalog.map((provider) => `
    <div class="provider-item is-locked" data-provider="${provider.id}">
      <div class="provider-head">
        <span class="provider-name">${provider.label}</span>
        <span class="provider-badges"><span class="provider-badge locked">${t("providerLocked")}</span></span>
      </div>
    </div>
  `).join("");
};

const setStatus = (providerId, text, type) => {
  const el = elements.providerList.querySelector(`.provider-item[data-provider="${providerId}"] .provider-status`);
  if (!el) return;
  el.textContent = text;
  el.className = `provider-status ${type || ""}`.trim();
};

const setOwnerLoginStatus = (text, type) => {
  elements.ownerLoginStatus.textContent = text;
  elements.ownerLoginStatus.className = `provider-status ${type || ""}`.trim();
};

const setOwnerUiState = () => {
  const unlocked = Boolean(state.auth.authenticated);
  const gated = Boolean(state.auth.gateEnabled);
  elements.ownerLoginForm.hidden = unlocked || !gated;
  elements.ownerLogoutButton.hidden = !unlocked || !gated;
  elements.ownerLoggedInBadge.hidden = !unlocked || !gated;
};

const loadOwnerProviders = async () => {
  try {
    current = await getSettings();
    renderProviders();
  } catch {
    state.auth.authenticated = false;
    setOwnerUiState();
    renderLocked();
  }
};

export const refreshOwnerSection = () => {
  setOwnerUiState();
  if (state.auth.authenticated) {
    loadOwnerProviders();
  } else {
    renderLocked();
  }
};

const handleListClick = async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const item = button.closest(".provider-item");
  const providerId = item.dataset.provider;
  const input = item.querySelector(".provider-key");
  const apiKey = input.value.trim();
  const action = button.dataset.action;
  const label = current.providers.find((p) => p.id === providerId)?.label || providerId;

  button.disabled = true;

  try {
    if (action === "save") {
      if (!apiKey) {
        setStatus(providerId, t("keyRequired"), "error");
        return;
      }
      current = await updateSettings({ provider: providerId, apiKey });
      input.value = "";
      renderProviders();
      setStatus(providerId, t("keySaved"), "ok");
      onChange();
    }

    if (action === "test") {
      setStatus(providerId, t("testing"), "");
      const result = await testConnection({ provider: providerId, apiKey: apiKey || undefined });
      setStatus(providerId, `${t("connectionOk")} (${result.model})`, "ok");
    }

    if (action === "use") {
      current = await updateSettings({ activeProvider: providerId });
      renderProviders();
      setStatus(providerId, t("providerSwitched").replace("{label}", label), "ok");
      onChange();
    }
  } catch (error) {
    setStatus(providerId, `${t("connectionFailed")}: ${error.message}`, "error");
    button.disabled = false;
  }
};

const handleOwnerLogin = async (event) => {
  event.preventDefault();
  const username = elements.ownerUsernameInput.value.trim();
  const password = elements.ownerPasswordInput.value;

  if (!username || !password) {
    setOwnerLoginStatus(t("ownerLoginRequired"), "error");
    return;
  }

  elements.ownerLoginButton.disabled = true;
  setOwnerLoginStatus(t("ownerLoggingIn"), "");

  try {
    await unlockOwner({ username, password });
    elements.ownerPasswordInput.value = "";
    setOwnerLoginStatus("", "");
    onChange();
  } catch (error) {
    setOwnerLoginStatus(error.message || t("ownerLoginFailed"), "error");
  } finally {
    elements.ownerLoginButton.disabled = false;
  }
};

const handleOwnerLogout = async () => {
  elements.ownerLogoutButton.disabled = true;
  try {
    await logoutOwner();
  } catch {
    /* ignore network errors on logout */
  } finally {
    elements.ownerLogoutButton.disabled = false;
  }
  onChange();
};

const open = () => {
  refreshOwnerSection();
  elements.settingsPanel.classList.add("open");
};

const close = () => {
  elements.settingsPanel.classList.remove("open");
};

export const initSettings = (onChangeCallback) => {
  onChange = typeof onChangeCallback === "function" ? onChangeCallback : () => {};

  elements.settingsToggle.addEventListener("click", open);
  elements.settingsClose.addEventListener("click", close);
  elements.settingsPanel.addEventListener("click", (event) => {
    if (event.target === elements.settingsPanel) close();
  });
  elements.providerList.addEventListener("click", handleListClick);
  elements.ownerLoginForm.addEventListener("submit", handleOwnerLogin);
  elements.ownerLogoutButton.addEventListener("click", handleOwnerLogout);
};
