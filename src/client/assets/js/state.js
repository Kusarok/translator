import { defaultMaxLength } from "./constants.js";

export const state = {
  loading: false,
  maxTextLength: defaultMaxLength,
  model: "gemma-4-31b",
  models: [],
  selectedModel: "gemma-4-31b"
};

export const setLoading = (value) => {
  state.loading = Boolean(value);
};

export const setHealth = ({ model, models, maxTextLength }) => {
  state.model = model || state.model;
  state.models = Array.isArray(models) ? models : state.models;
  state.selectedModel = model || state.selectedModel;
  state.maxTextLength = Number.isFinite(maxTextLength) ? maxTextLength : state.maxTextLength;
};
