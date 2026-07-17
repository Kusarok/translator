import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { providerCatalog, providerMap, publicModels } from "../config/providers.js";
import { HttpError } from "../utils/http-error.js";
import { openSecret, sealSecret } from "./app-secret.js";

const settingsFile = path.join(env.dataDir, "settings.json");

const load = () => {
  try {
    return JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  } catch {
    return { activeProvider: "", providers: {} };
  }
};

let store = load();

const persist = () => {
  try {
    fs.mkdirSync(env.dataDir, { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify(store, null, 2), { mode: 0o600 });
    fs.chmodSync(settingsFile, 0o600);
  } catch {}
};

const envKey = (provider) => String(process.env[provider.envKey] || "").trim();
const envBaseUrl = (provider) => String(process.env[provider.envBaseUrl] || "").trim();
const storedProvider = (id) => store.providers?.[id] || {};

const requireProvider = (id) => {
  const provider = providerMap[id];
  if (!provider) {
    throw new HttpError(400, `Unknown provider: ${id}`);
  }
  return provider;
};

const resolveKey = (id) => {
  const provider = providerMap[id];
  if (!provider) return "";
  const saved = String(openSecret(storedProvider(id).apiKey || "", `provider:${id}`) || "").trim();
  return saved || envKey(provider);
};

const resolveModel = (id) => {
  const provider = providerMap[id];
  if (!provider) return "";
  const saved = storedProvider(id).model;
  if (saved && provider.models.some((model) => model.id === saved)) {
    return saved;
  }
  return provider.defaultModel;
};

const resolveBaseUrl = (id) => {
  const provider = providerMap[id];
  return envBaseUrl(provider) || provider.baseUrl;
};

const isConfigured = (id) => Boolean(resolveKey(id));

export const getActiveProvider = () => {
  if (store.activeProvider && providerMap[store.activeProvider]) {
    return store.activeProvider;
  }
  if (env.defaultProvider && providerMap[env.defaultProvider] && isConfigured(env.defaultProvider)) {
    return env.defaultProvider;
  }
  const configured = providerCatalog.find((provider) => isConfigured(provider.id));
  return (configured || providerCatalog[0]).id;
};

export const getProviderRuntime = (id) => {
  const provider = requireProvider(id);
  return {
    id: provider.id,
    apiKey: resolveKey(provider.id),
    baseUrl: resolveBaseUrl(provider.id),
    model: resolveModel(provider.id),
    tokenParam: provider.tokenParam,
    extraHeaders: provider.extraHeaders || {}
  };
};

export const getPublicState = () => ({
  activeProvider: getActiveProvider(),
  providers: providerCatalog.map((provider) => ({
    id: provider.id,
    label: provider.label,
    configured: isConfigured(provider.id),
    fromEnv: Boolean(envKey(provider)) && !storedProvider(provider.id).apiKey,
    selectedModel: resolveModel(provider.id),
    models: publicModels(provider)
  }))
});

export const setActiveProvider = (id) => {
  requireProvider(id);
  store.activeProvider = id;
  persist();
};

export const setProviderKey = (id, apiKey) => {
  requireProvider(id);
  store.providers = store.providers || {};
  store.providers[id] = store.providers[id] || {};
  const clean = String(apiKey || "").trim();
  if (clean) {
    store.providers[id].apiKey = sealSecret(clean, `provider:${id}`);
  } else {
    delete store.providers[id].apiKey;
  }
  persist();
};

// Migrate legacy plaintext provider keys in place without changing their runtime value.
let migrated = false;
for (const [id, value] of Object.entries(store.providers || {})) {
  if (value?.apiKey && !String(value.apiKey).startsWith("enc:v1:")) {
    value.apiKey = sealSecret(value.apiKey, `provider:${id}`); migrated = true;
  }
}
if (migrated) persist(); else if (fs.existsSync(settingsFile)) { try { fs.chmodSync(settingsFile, 0o600); } catch {} }

export const setProviderModel = (id, model) => {
  const provider = requireProvider(id);
  if (!provider.models.some((entry) => entry.id === model)) {
    throw new HttpError(400, `Unknown model: ${model}`);
  }
  store.providers = store.providers || {};
  store.providers[id] = store.providers[id] || {};
  store.providers[id].model = model;
  persist();
};
