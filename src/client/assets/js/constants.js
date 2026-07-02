export const languageNames = {
  auto: "Auto detect",
  fa: "Persian",
  en: "English"
};

export const oppositeLanguage = {
  fa: "en",
  en: "fa"
};

export const defaultMaxLength = 8000;

export const hasPersianText = (value) => /[\u0600-\u06ff]/.test(value);
