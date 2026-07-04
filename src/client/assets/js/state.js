import { defaultMaxLength } from "./constants.js";

export const state = {
  loading: false,
  maxTextLength: defaultMaxLength,
  model: "gemma-4-31b",
  models: [],
  selectedModel: "gemma-4-31b",
  auth: { gateEnabled: false, authenticated: true },
  catalog: [],
  free: { enabled: false, provider: "cerebras", model: "gemma-4-31b", rateLimit: 5 }
};

export const setLoading = (value) => {
  state.loading = Boolean(value);
};

export const setHealth = ({ model, models, maxTextLength, auth, catalog, free }) => {
  state.model = model || state.model;
  state.models = Array.isArray(models) ? models : state.models;
  state.selectedModel = model || state.selectedModel;
  state.maxTextLength = Number.isFinite(maxTextLength) ? maxTextLength : state.maxTextLength;
  if (auth) state.auth = auth;
  if (Array.isArray(catalog)) state.catalog = catalog;
  if (free) state.free = free;
};
