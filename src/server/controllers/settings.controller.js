import {
  getPublicState,
  setActiveProvider,
  setProviderKey,
  setProviderModel
} from "../services/settings.store.js";
import { testProvider } from "../services/provider.service.js";
import { isOwnerAuthenticated } from "../services/auth.service.js";

export const getSettings = (_req, res) => {
  res.json(getPublicState());
};

export const updateSettings = (req, res) => {
  const { activeProvider, provider, apiKey, model } = req.body || {};

  if (typeof apiKey === "string" && provider) {
    setProviderKey(provider, apiKey);
  }

  if (model && provider) {
    setProviderModel(provider, model);
  }

  if (activeProvider) {
    setActiveProvider(activeProvider);
  }

  res.json(getPublicState());
};

export const testSettings = async (req, res) => {
  const { provider, apiKey, model } = req.body || {};
  const result = await testProvider({ providerId: provider, apiKey, model, authenticated: isOwnerAuthenticated(req) });
  res.json(result);
};
