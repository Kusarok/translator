import { env } from "../config/env.js";
import { createChatCompletion } from "./cerebras.service.js";
import { HttpError } from "../utils/http-error.js";

const languages = {
  auto: "Auto detect",
  fa: "Persian",
  en: "English"
};

const translationPrompt = `You are a professional Persian ↔ English translator.

Your job is to translate text accurately between Persian and English, depending on the language of the user's message.

Translation requirements:

- Produce fluent, natural, human-sounding translations, not literal word-for-word translations.
- Preserve the original meaning, intent, tone, emotional nuance, and level of formality.
- Adapt idioms, expressions, slang, and cultural references so they sound natural in the target language.
- Keep technical terms, names, code, commands, URLs, numbers, dates, and formatting unchanged unless translation is clearly necessary.
- Preserve paragraph structure, lists, quotation marks, Markdown, and line breaks where possible.
- When the source text is ambiguous, choose the most natural interpretation based on context.
- Do not add explanations, notes, summaries, corrections, or extra commentary unless the user explicitly asks for them.
- Return only the translated text.

If the user writes in Persian, translate it into natural English.
If the user writes in English, translate it into fluent, natural Persian.`;

const normalizeText = (value) => String(value || "").trim();

const normalizeLanguage = (value, fallback) => {
  return Object.hasOwn(languages, value) ? value : fallback;
};

const createInstruction = ({ sourceLanguage, targetLanguage }) => {
  const source = languages[sourceLanguage];
  const target = languages[targetLanguage];

  return [
    translationPrompt,
    `Selected source language: ${source}.`,
    `Selected target language: ${target}.`,
    `Translate the user's text into ${target}.`,
    "If source language is auto detect, detect whether the text is Persian or English before translating.",
    "If selected source and target are the same, rewrite the text naturally in the selected language without changing its meaning.",
    "Return only the final translated text."
  ].join("\n");
};

export const translateText = async ({ text, sourceLanguage, targetLanguage }) => {
  const cleanText = normalizeText(text);
  const source = normalizeLanguage(sourceLanguage, "auto");
  const target = normalizeLanguage(targetLanguage, "en");

  if (!cleanText) {
    throw new HttpError(400, "Text is required");
  }

  if (cleanText.length > env.maxTextLength) {
    throw new HttpError(413, `Text must be ${env.maxTextLength} characters or fewer`);
  }

  if (target === "auto") {
    throw new HttpError(400, "Target language must be Persian or English");
  }

  return createChatCompletion([
    {
      role: "system",
      content: createInstruction({ sourceLanguage: source, targetLanguage: target })
    },
    {
      role: "user",
      content: cleanText
    }
  ]);
};
