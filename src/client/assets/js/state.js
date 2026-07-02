import { defaultMaxLength } from "./constants.js";

export const state = {
  loading: false,
  maxTextLength: defaultMaxLength,
  model: "gemma-4-31b"
};

export const setLoading = (value) => {
  state.loading = Boolean(value);
};

export const setHealth = ({ model, maxTextLength }) => {
  state.model = model || state.model;
  state.maxTextLength = Number.isFinite(maxTextLength) ? maxTextLength : state.maxTextLength;
};
