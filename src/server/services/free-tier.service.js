import { env } from "../config/env.js";
import { providerMap } from "../config/providers.js";
import { getProviderRuntime } from "./settings.store.js";

// The free tier lets anonymous visitors (no BYOK key, not the owner) use a single
// server-funded model. To keep the shared key safe it is locked to one provider/model,
// the output tokens are capped, and every request is rate limited per visitor.

const freeProvider = () => providerMap[env.freeProvider];

const freeModelId = () => {
  const provider = freeProvider();
  if (!provider) return env.freeModel;
  // Only allow a model that actually exists on the provider; fall back to its default.
  return provider.models.some((model) => model.id === env.freeModel)
    ? env.freeModel
    : provider.defaultModel;
};

// Free tier is available only when it is switched on, the configured provider exists,
// and that provider has a server-side key to spend.
export const freeTierEnabled = () => {
  if (!env.freeTierEnabled) return false;
  const provider = freeProvider();
  if (!provider) return false;
  return Boolean(getProviderRuntime(provider.id).apiKey);
};

// Runtime used for anonymous free requests. The model is locked and output is capped
// so a visitor cannot swap in an expensive model or drain the shared key.
export const getFreeRuntime = () => {
  const runtime = getProviderRuntime(freeProvider().id);
  return {
    ...runtime,
    model: freeModelId(),
    lockModel: true,
    maxCompletionTokens: env.freeMaxTokens,
    maxImages: env.freeMaxImages,
    maxInputChars: env.freeMaxInputChars,
    source: "free"
  };
};

export const freeTierInfo = () => ({
  enabled: freeTierEnabled(),
  provider: env.freeProvider,
  model: freeModelId(),
  rateLimit: env.freeRateLimit,
  windowMs: env.freeWindowMs
});
