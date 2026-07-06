export const languages = [
  { code: "auto", native: "Auto detect", flag: "🌐", rtl: false },
  { code: "en", native: "English", flag: "🇬🇧", rtl: false },
  { code: "fa", native: "فارسی", flag: "🇮🇷", rtl: true },
  { code: "ar", native: "العربية", flag: "🇸🇦", rtl: true },
  { code: "he", native: "עברית", flag: "🇮🇱", rtl: true },
  { code: "ur", native: "اردو", flag: "🇵🇰", rtl: true },
  { code: "fr", native: "Français", flag: "🇫🇷", rtl: false },
  { code: "de", native: "Deutsch", flag: "🇩🇪", rtl: false },
  { code: "es", native: "Español", flag: "🇪🇸", rtl: false },
  { code: "it", native: "Italiano", flag: "🇮🇹", rtl: false },
  { code: "pt", native: "Português", flag: "🇵🇹", rtl: false },
  { code: "ru", native: "Русский", flag: "🇷🇺", rtl: false },
  { code: "tr", native: "Türkçe", flag: "🇹🇷", rtl: false },
  { code: "nl", native: "Nederlands", flag: "🇳🇱", rtl: false },
  { code: "pl", native: "Polski", flag: "🇵🇱", rtl: false },
  { code: "uk", native: "Українська", flag: "🇺🇦", rtl: false },
  { code: "sv", native: "Svenska", flag: "🇸🇪", rtl: false },
  { code: "hi", native: "हिन्दी", flag: "🇮🇳", rtl: false },
  { code: "bn", native: "বাংলা", flag: "🇧🇩", rtl: false },
  { code: "zh", native: "中文", flag: "🇨🇳", rtl: false },
  { code: "ja", native: "日本語", flag: "🇯🇵", rtl: false },
  { code: "ko", native: "한국어", flag: "🇰🇷", rtl: false },
  { code: "id", native: "Bahasa Indonesia", flag: "🇮🇩", rtl: false },
  { code: "vi", native: "Tiếng Việt", flag: "🇻🇳", rtl: false },
  { code: "th", native: "ไทย", flag: "🇹🇭", rtl: false },
  { code: "el", native: "Ελληνικά", flag: "🇬🇷", rtl: false },
  { code: "az", native: "Azərbaycan", flag: "🇦🇿", rtl: false }
];

export const languageMap = Object.fromEntries(languages.map((lang) => [lang.code, lang]));

export const defaultMaxLength = 8000;

export const hasRtlText = (value) =>
  /[֐-׿؀-ۿ܀-ݏݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(value);
