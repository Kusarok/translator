let lang = localStorage.getItem("lang") || "fa";

export const getLang = () => lang;

export const setLang = (next) => {
  lang = next;
  localStorage.setItem("lang", next);
};

export const translations = {
  fa: {
    dir: "rtl",
    title: "مترجم فارسی و انگلیسی",
    appName: "مترجم",
    selectModel: "انتخاب مدل",
    selectTone: "انتخاب لحن",
    toggleTheme: "تغییر تم",
    switchLang: "English",
    checkingStatus: "در حال بررسی",
    online: "آنلاین",
    offline: "آفلاین",
    sourceLanguage: "زبان ورودی",
    targetLanguage: "زبان خروجی",
    autoDetect: "تشخیص خودکار",
    persian: "فارسی",
    english: "انگلیسی",
    swapLanguages: "جابجایی زبان‌ها",
    inputText: "متن ورودی",
    inputPlaceholder: "متن فارسی یا انگلیسی را بنویسید یا paste کنید...",
    paste: "Paste",
    clear: "پاک کردن",
    translation: "ترجمه",
    ready: "آماده",
    outputPlaceholder: "ترجمه اینجا نمایش داده می‌شود...",
    copy: "کپی",
    translate: "ترجمه",
    translating: "در حال ترجمه",
    statModel: "مدل",
    statInput: "توکن ورودی",
    statOutput: "توکن خروجی",
    statSpeed: "توکن/ثانیه",
    statTime: "زمان",
    toneDefault: "پیش‌فرض",
    toneFormal: "رسمی",
    toneInformal: "غیررسمی",
    toneTechnical: "تخصصی",
    msgEmpty: "متن را وارد کنید.",
    msgTooLong: "متن باید حداکثر {max} کاراکتر باشد.",
    msgDone: "انجام شد.",
    msgPasted: "متن وارد شد.",
    msgPasteFail: "Paste در این مرورگر در دسترس نیست.",
    msgNothingToCopy: "متنی برای کپی وجود ندارد.",
    msgCopied: "کپی شد."
  },
  en: {
    dir: "ltr",
    title: "Persian-English Translator",
    appName: "Translator",
    selectModel: "Select model",
    selectTone: "Select tone",
    toggleTheme: "Toggle theme",
    switchLang: "فارسی",
    checkingStatus: "Checking",
    online: "Online",
    offline: "Offline",
    sourceLanguage: "Source language",
    targetLanguage: "Target language",
    autoDetect: "Auto detect",
    persian: "Persian",
    english: "English",
    swapLanguages: "Swap languages",
    inputText: "Input text",
    inputPlaceholder: "Type or paste Persian or English text...",
    paste: "Paste",
    clear: "Clear",
    translation: "Translation",
    ready: "Ready",
    outputPlaceholder: "Translation will appear here...",
    copy: "Copy",
    translate: "Translate",
    translating: "Translating",
    statModel: "Model",
    statInput: "Input tokens",
    statOutput: "Output tokens",
    statSpeed: "tokens/s",
    statTime: "Time",
    toneDefault: "Default",
    toneFormal: "Formal",
    toneInformal: "Informal",
    toneTechnical: "Technical",
    msgEmpty: "Please enter some text.",
    msgTooLong: "Text must be {max} characters or fewer.",
    msgDone: "Done.",
    msgPasted: "Text pasted.",
    msgPasteFail: "Paste is not available in this browser.",
    msgNothingToCopy: "Nothing to copy.",
    msgCopied: "Copied."
  }
};

export const t = (key, vars) => {
  let str = translations[lang]?.[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, v);
    }
  }
  return str;
};
