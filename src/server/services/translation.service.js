import { env } from "../config/env.js";
import { createChatCompletion } from "./provider.service.js";
import { resolveRuntime } from "./runtime.service.js";
import { HttpError } from "../utils/http-error.js";
import { cacheKey, getCached, setCached } from "../utils/cache.js";

const languages = {
  auto: "Auto detect",
  en: "English",
  fa: "Persian",
  ar: "Arabic",
  he: "Hebrew",
  ur: "Urdu",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  tr: "Turkish",
  nl: "Dutch",
  pl: "Polish",
  uk: "Ukrainian",
  sv: "Swedish",
  hi: "Hindi",
  bn: "Bengali",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  id: "Indonesian",
  vi: "Vietnamese",
  th: "Thai",
  el: "Greek",
  az: "Azerbaijani"
};

const toneInstructions = {
  default: "",
  formal: "Use a formal, polite register appropriate for professional or official contexts.",
  informal: "Use a casual, conversational tone appropriate for everyday communication.",
  technical: "Use precise technical terminology appropriate for specialized or academic contexts."
};

const normalizeTone = (value) =>
  Object.hasOwn(toneInstructions, value) ? value : "default";

const translationPrompt = `You are a professional translator fluent in every language.

Your job is to translate text accurately from the source language into the target language.

Translation requirements:

- Produce fluent, natural, human-sounding translations, not literal word-for-word translations.
- Preserve the original meaning, intent, tone, emotional nuance, and level of formality.
- Adapt idioms, expressions, slang, and cultural references so they sound natural in the target language.
- Keep technical terms, names, code, commands, URLs, numbers, dates, and formatting unchanged unless translation is clearly necessary.
- Preserve paragraph structure, lists, quotation marks, Markdown, and line breaks where possible.
- When the source text is ambiguous, choose the most natural interpretation based on context.
- Do not add explanations, notes, summaries, corrections, or extra commentary unless the user explicitly asks for them.
- Return only the translated text.`;

const normalizeText = (value) => String(value || "").trim();

const normalizeLanguage = (value, fallback) => {
  return Object.hasOwn(languages, value) ? value : fallback;
};

const createInstruction = ({ sourceLanguage, targetLanguage, tone }) => {
  const source = languages[sourceLanguage];
  const target = languages[targetLanguage];
  const toneText = toneInstructions[tone] || "";

  return [
    translationPrompt,
    `Selected source language: ${source}.`,
    `Selected target language: ${target}.`,
    toneText ? `Tone: ${toneText}` : "",
    `Translate the user's text into ${target}.`,
    "If the source language is auto detect, identify the language of the text before translating.",
    "If the selected source and target are the same, rewrite the text naturally in that language without changing its meaning.",
    "Return only the final translated text."
  ].filter(Boolean).join("\n");
};

export const translateText = async ({ text, sourceLanguage, targetLanguage, model, tone, provider, apiKey, authenticated }) => {
  const cleanText = normalizeText(text);
  const source = normalizeLanguage(sourceLanguage, "auto");
  const target = normalizeLanguage(targetLanguage, "en");
  const selectedTone = normalizeTone(tone);

  if (!cleanText) {
    throw new HttpError(400, "Text is required");
  }

  if (cleanText.length > env.maxTextLength) {
    throw new HttpError(413, `Text must be ${env.maxTextLength} characters or fewer`);
  }

  if (target === "auto") {
    throw new HttpError(400, "Target language must be a specific language");
  }

  const runtime = resolveRuntime({ provider, apiKey, model, authenticated });
  // On the free tier the model is locked server-side; a client-supplied model is ignored.
  const selectedModel = runtime.lockModel ? runtime.model : (model || runtime.model);

  const key = cacheKey({ provider: runtime.id, model: selectedModel, sourceLanguage: source, targetLanguage: target, tone: selectedTone, text: cleanText });
  const cached = getCached(key);

  if (cached) {
    return cached;
  }

  const result = await createChatCompletion([
    {
      role: "system",
      content: createInstruction({ sourceLanguage: source, targetLanguage: target, tone: selectedTone })
    },
    {
      role: "user",
      content: cleanText
    }
  ], selectedModel, runtime);

  setCached(key, result);
  return result;
};
