const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const retryableStatus = (status) => status === 429 || status >= 500;

const finalError = (error, attempts) => {
  if (["AbortError", "TimeoutError"].includes(error?.name)) {
    return new Error(`Lyrics search timed out after ${attempts} attempts.`);
  }
  return error instanceof Error ? error : new Error("Lyrics search failed.");
};

export const fetchLrclibSearch = async (query, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 20000,
  maxAttempts = 3,
  pause = wait
} = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": "Translator/1.0 (lyrics-first search)" },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) {
        const error = new Error(`Lyrics search returned HTTP ${response.status}.`);
        error.retryable = retryableStatus(response.status);
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || error?.retryable === false) break;
      await pause(250 * (2 ** (attempt - 1)));
    }
  }
  throw finalError(lastError, maxAttempts);
};
