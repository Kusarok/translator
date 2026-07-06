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

// Sent ONLY when the user uploaded a song/audio file (mode === "audio"). It tells the model
// the text is a spoken conversation or song lyrics so it translates with context and keeps the
// exact line structure (so timestamps can be re-attached line-by-line on the client).
const audioPrompt = `You are translating the transcript of an audio recording — a spoken conversation or the lyrics of a song.

Translation requirements for this audio/lyrics content:
- Treat the text as spoken or sung words. Use the overall context of the whole piece so the meaning is never lost.
- Translate faithfully and naturally into the target language; preserve meaning, tone, emotion, and imagery.
- Do NOT alter the content: do not add, remove, merge, split, reorder, explain, or comment. Only translate.
- Keep the exact line structure: output exactly one translated line for each input line, in the same order, with no extra blank lines.
- Adapt idioms only as needed so they read naturally, without changing the intended meaning.
- Return only the translated lines.`;

const normalizeText = (value) => String(value || "").trim();

const normalizeLanguage = (value, fallback) => {
  return Object.hasOwn(languages, value) ? value : fallback;
};

const createInstruction = ({ sourceLanguage, targetLanguage, tone, mode }) => {
  const source = languages[sourceLanguage];
  const target = languages[targetLanguage];
  const toneText = toneInstructions[tone] || "";
  const isAudio = mode === "audio";

  return [
    isAudio ? audioPrompt : translationPrompt,
    `Selected source language: ${source}.`,
    `Selected target language: ${target}.`,
    !isAudio && toneText ? `Tone: ${toneText}` : "",
    `Translate the user's text into ${target}.`,
    "If the source language is auto detect, identify the language of the text before translating.",
    isAudio ? "" : "If the selected source and target are the same, rewrite the text naturally in that language without changing its meaning.",
    isAudio ? "Return only the translated lines, one per input line." : "Return only the final translated text."
  ].filter(Boolean).join("\n");
};

// Only accept language codes we actually know (never "auto"); anything else becomes "".
const normalizeCode = (value) => {
  const code = String(value || "").trim().toLowerCase();
  return Object.hasOwn(languages, code) && code !== "auto" ? code : "";
};

// Two-way "conversation" mode: the interpreter detects the message language and translates it
// toward whichever of the two poles it is NOT, so a reply typed in the target language is sent
// back in the other party's language automatically — no settings change needed.
const createConversationInstruction = ({ targetLanguage, counterpart }) => {
  const target = languages[targetLanguage];
  const other = counterpart && languages[counterpart] ? languages[counterpart] : null;

  const rule = other
    ? `Detect the language of the message. If the message is written in ${target} (${targetLanguage}), translate it into ${other} (${counterpart}). Otherwise translate it into ${target} (${targetLanguage}).`
    : `Detect the language of the message and translate it into ${target} (${targetLanguage}). If the message is already written in ${target}, translate it into English (en) instead.`;

  return [
    "You are a live interpreter standing between two people in a back-and-forth conversation.",
    rule,
    "Produce a fluent, natural, faithful translation — not word-for-word. Preserve meaning, tone, nuance, and line breaks. Do not add notes, labels, or commentary.",
    "Reply in EXACTLY this format and nothing else:",
    "- The FIRST line is two ISO 639-1 codes joined by '>': the detected source code, then the code you translated INTO. Example: fa>en",
    "- From the SECOND line onward, output ONLY the translated text.",
    "Use standard ISO codes such as en, fa, ar, he, ur, fr, de, es, it, pt, ru, tr, zh, ja, ko, hi."
  ].join("\n");
};

// Parses the "<src>>​<tgt>\n<translation>" reply. Falls back to treating the whole reply as the
// translation if the model didn't emit the code header, so output is never lost.
const parseRoutedOutput = (raw, fallbackTarget) => {
  const text = String(raw || "");
  const newline = text.indexOf("\n");
  const header = (newline === -1 ? text : text.slice(0, newline)).trim();
  const match = header.match(/^([a-z]{2})\s*>\s*([a-z]{2})$/i);

  if (match) {
    const body = newline === -1 ? "" : text.slice(newline + 1).trim();
    return {
      detected: normalizeCode(match[1]),
      target: normalizeCode(match[2]) || fallbackTarget,
      text: body || text.trim()
    };
  }
  return { detected: "", target: fallbackTarget, text: text.trim() };
};

export const translateText = async ({ text, sourceLanguage, targetLanguage, model, tone, mode, conversation, counterpart, provider, apiKey, authenticated }) => {
  const cleanText = normalizeText(text);
  const source = normalizeLanguage(sourceLanguage, "auto");
  const target = normalizeLanguage(targetLanguage, "en");
  const selectedTone = normalizeTone(tone);
  const isAudio = mode === "audio";
  const isConversation = Boolean(conversation) && !isAudio;
  // Only a real, different counterpart is useful for routing.
  const counterpartCode = normalizeCode(counterpart);
  const validCounterpart = counterpartCode && counterpartCode !== target ? counterpartCode : "";

  if (!cleanText) {
    throw new HttpError(400, "Text is required");
  }

  // Audio transcripts (podcasts, long songs) can run longer than the manual-entry limit,
  // so give the audio path a higher ceiling while still bounding request size.
  const textLimit = isAudio ? Math.max(env.maxTextLength, 20000) : env.maxTextLength;
  if (cleanText.length > textLimit) {
    throw new HttpError(413, `Text must be ${textLimit} characters or fewer`);
  }

  if (target === "auto") {
    throw new HttpError(400, "Target language must be a specific language");
  }

  const runtime = resolveRuntime({ provider, apiKey, model, authenticated });
  // On the free tier the model is locked server-side; a client-supplied model is ignored.
  const selectedModel = runtime.lockModel ? runtime.model : (model || runtime.model);

  const modeKey = isAudio ? "audio" : (isConversation ? "conv" : "text");
  const key = cacheKey({ provider: runtime.id, model: selectedModel, sourceLanguage: source, targetLanguage: target, tone: selectedTone, mode: modeKey, counterpart: validCounterpart, text: cleanText });
  const cached = getCached(key);

  if (cached) {
    return cached;
  }

  if (isConversation) {
    const raw = await createChatCompletion([
      { role: "system", content: createConversationInstruction({ targetLanguage: target, counterpart: validCounterpart }) },
      { role: "user", content: cleanText }
    ], selectedModel, runtime);

    const parsed = parseRoutedOutput(raw.text, target);
    const result = {
      text: parsed.text || raw.text,
      detected: parsed.detected,
      resolvedTarget: parsed.target,
      model: raw.model,
      usage: raw.usage,
      timing: raw.timing
    };
    setCached(key, result);
    return result;
  }

  const result = await createChatCompletion([
    {
      role: "system",
      content: createInstruction({ sourceLanguage: source, targetLanguage: target, tone: selectedTone, mode: isAudio ? "audio" : "text" })
    },
    {
      role: "user",
      content: cleanText
    }
  ], selectedModel, runtime);

  setCached(key, result);
  return result;
};
