import { providerMap } from "../config/providers.js";
import { HttpError } from "../utils/http-error.js";
import { getActiveProvider, getProviderRuntime } from "./settings.store.js";
import { freeTierEnabled, getFreeRuntime } from "./free-tier.service.js";

export const resolveRuntime = ({ provider, apiKey, model, authenticated }) => {
  const cleanKey = String(apiKey || "").trim();

  if (provider && cleanKey) {
    const def = providerMap[provider];
    if (!def) {
      throw new HttpError(400, `Unknown provider: ${provider}`);
    }

    const resolvedModel = model && def.models.some((entry) => entry.id === model) ? model : def.defaultModel;

    return {
      id: def.id,
      apiKey: cleanKey,
      baseUrl: def.baseUrl,
      model: resolvedModel,
      tokenParam: def.tokenParam,
      extraHeaders: def.extraHeaders || {},
      source: "byok"
    };
  }

  if (authenticated) {
    return { ...getProviderRuntime(getActiveProvider()), source: "owner" };
  }

  // Anonymous visitor with no key: fall back to the rate-limited free tier if enabled.
  if (freeTierEnabled()) {
    return getFreeRuntime();
  }

  throw new HttpError(401, "Add your own API key, or log in as the owner to use the shared key.");
};
