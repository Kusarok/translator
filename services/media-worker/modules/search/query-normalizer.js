export const normalizeSearchText = (value) => String(value || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’‘`]/g, "'").toLowerCase()
  .replace(/[^\p{L}\p{N}']+/gu, " ").replace(/\s+/g, " ").trim();

export const validateSearchQuery = (value) => {
  const query = String(value || "").trim();
  if (query.length < 2) throw new TypeError("Search must contain at least 2 characters.");
  if (query.length > 100) throw new TypeError("Search must be 100 characters or fewer.");
  return { query, normalized: normalizeSearchText(query) };
};

export const ftsPhrase = (normalized) => `"${normalized.replaceAll('"', '""')}"`;
