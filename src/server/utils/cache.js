const cache = new Map();
const TTL = 10 * 60 * 1000;
const MAX = 100;

export const cacheKey = ({ model, sourceLanguage, targetLanguage, tone, text }) =>
  `${model || "default"}:${sourceLanguage}:${targetLanguage}:${tone || "default"}:${text}`;

export const getCached = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
};

export const setCached = (key, value) => {
  if (cache.size >= MAX) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, { value, timestamp: Date.now() });
};
