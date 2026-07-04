export const languages = [
  { code: "auto", native: "Auto detect", rtl: false },
  { code: "en", native: "English", rtl: false },
  { code: "fa", native: "فارسی", rtl: true },
  { code: "ar", native: "العربية", rtl: true },
  { code: "he", native: "עברית", rtl: true },
  { code: "ur", native: "اردو", rtl: true },
  { code: "fr", native: "Français", rtl: false },
  { code: "de", native: "Deutsch", rtl: false },
  { code: "es", native: "Español", rtl: false },
  { code: "it", native: "Italiano", rtl: false },
  { code: "pt", native: "Português", rtl: false },
  { code: "ru", native: "Русский", rtl: false },
  { code: "tr", native: "Türkçe", rtl: false },
  { code: "nl", native: "Nederlands", rtl: false },
  { code: "pl", native: "Polski", rtl: false },
  { code: "uk", native: "Українська", rtl: false },
  { code: "sv", native: "Svenska", rtl: false },
  { code: "hi", native: "हिन्दी", rtl: false },
  { code: "bn", native: "বাংলা", rtl: false },
  { code: "zh", native: "中文", rtl: false },
  { code: "ja", native: "日本語", rtl: false },
  { code: "ko", native: "한국어", rtl: false },
  { code: "id", native: "Bahasa Indonesia", rtl: false },
  { code: "vi", native: "Tiếng Việt", rtl: false },
  { code: "th", native: "ไทย", rtl: false },
  { code: "el", native: "Ελληνικά", rtl: false },
  { code: "az", native: "Azərbaycan", rtl: false }
];

export const languageMap = Object.fromEntries(languages.map((lang) => [lang.code, lang]));

export const defaultMaxLength = 8000;

export const hasRtlText = (value) =>
  /[֐-׿؀-ۿ܀-ݏݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(value);
