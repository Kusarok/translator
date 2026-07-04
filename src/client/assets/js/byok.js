import { state } from "./state.js";

const ACTIVE_KEY = "byok.activeProvider";
const STORE_KEY = "byok.keys";

const readStore = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeStore = (store) => {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
};

export const getActiveProvider = () => localStorage.getItem(ACTIVE_KEY) || "";

export const setActiveProvider = (providerId) => {
  if (providerId) {
    localStorage.setItem(ACTIVE_KEY, providerId);
  } else {
    localStorage.removeItem(ACTIVE_KEY);
  }
};

export const getEntry = (providerId) => readStore()[providerId] || null;

export const saveEntry = (providerId, { apiKey, model }) => {
  const store = readStore();
  store[providerId] = { apiKey, model: model || "" };
  writeStore(store);
};

export const updateModel = (providerId, model) => {
  const store = readStore();
  if (!store[providerId]) return;
  store[providerId] = { ...store[providerId], model };
  writeStore(store);
};

export const removeEntry = (providerId) => {
  const store = readStore();
  delete store[providerId];
  writeStore(store);
  if (getActiveProvider() === providerId) {
    setActiveProvider("");
  }
};

export const getRuntime = () => {
  const providerId = getActiveProvider();
  if (!providerId) return null;
  const entry = getEntry(providerId);
  if (!entry?.apiKey) return null;
  return { provider: providerId, apiKey: entry.apiKey, model: entry.model || "" };
};

export const getRequestPayload = () => {
  const runtime = getRuntime();
  return runtime ? { provider: runtime.provider, apiKey: runtime.apiKey } : {};
};

export const getGoogleKey = () => getEntry("google")?.apiKey || "";

export const hasUsableKey = () => Boolean(getRuntime()) || Boolean(state.auth?.authenticated);
