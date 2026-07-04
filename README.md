# Translator

Natural, meaning-preserving translation and AI chat, built for talking to the world with confidence.

The goal of this app is simple: translate text **without losing the meaning of the words**, keep the language **completely natural** in every sentence, and make it **easy and safe** to have a real conversation with anyone, anywhere in the world.

**Live demo & app:** https://translate.raminexch.store/

> The demo address may change later — that's fine, the app works the same wherever it's hosted.

---

## What it does

- 🌍 **25+ languages** with fluent, human-sounding translations, not word-for-word.
- 🧠 **Meaning first** — tone, nuance, idioms, and intent are preserved, so nothing gets lost in translation.
- 💬 **AI chat** with image (vision) support.
- 🎙️ **Live voice translation** — speak and hear the translation back in real time.
- 🌐 **Bilingual UI** (English / Persian) with light and dark themes.
- 📱 **Installable** — add it to your home screen and use it like a native app.

## Bring your own API key (BYOK) — nothing is stored

Open the app, tap the ⚙ **Settings** button, and paste your own API key under **Your API Key**.

**Nothing is saved.** Your key stays **only in your own browser** (`localStorage`) and is sent directly with your own requests. It is **never** written to the server, **never** logged, and **never** shared with anyone. Clear your browser data and it is gone. This is intentional, so you can use the app with complete peace of mind.

Get a free key from any of these providers:

| Provider | Get a key | Notes |
| --- | --- | --- |
| **Cerebras** | [cloud.cerebras.ai](https://cloud.cerebras.ai) | Very fast inference |
| **OpenRouter** | [openrouter.ai/keys](https://openrouter.ai/keys) | Free models are auto-selected for you |
| **Google AI Studio** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Gemma & Gemini; required for Live voice |

Steps: pick a provider → paste the key → **Save key** → **Test** → **Use**.

## Install it as an app (Add to Home Screen)

For the smoothest experience, install it like a native app:

- **iPhone / iPad (Safari):** tap the **Share** icon, then **Add to Home Screen**.
- **Android (Chrome):** tap the **⋮** menu, then **Add to Home screen** / **Install app**.
- **Desktop (Chrome / Edge):** click the **install** icon in the address bar.

It then opens full-screen with its own icon and feels like a real app.

## Self-hosting

```bash
git clone <your-repo-url>
cd translator
npm install
npm start
```

Open **http://localhost:8080** and add a key in ⚙ Settings. That's the whole setup — no config files required.

## For deployment owners: protect your own keys

If you host this publicly, you can let visitors use their **own** keys (BYOK) while keeping **your** keys private behind a login. Add an owner login in `.env`:

```text
OWNER_USERNAME=you
OWNER_PASSWORD=a-strong-password
SESSION_TTL_HOURS=720
```

With both set, the **API Providers** section always shows 🔒 locked badges and a login form until someone enters that exact username + password. A successful login sets a signed, `HttpOnly` session cookie (default 30 days); **Logout** ends it early. Visitors can still use their own key from **Your API Key** at any time. Leave both empty to keep the simple no-login behavior for local/private use.

## Free tier: let every visitor try it, without leaking your key

You can offer visitors a **free, no-key** experience on one server-funded model while keeping everything else behind the owner login. By default this is **Gemma 4 on Cerebras, 5 requests per minute per visitor**.

When free tier is on, an anonymous visitor (no owner login, no key of their own) can translate and chat right away. Every free request is hardened so the shared key can't be abused or drained:

- 🔒 **The key never reaches the browser.** Free requests are proxied server-side; only `configured: true/false` is ever exposed to the client.
- 🎯 **The model is locked.** A client can't swap in a bigger/more expensive model — the server ignores the requested model and always uses `FREE_MODEL`.
- ⏱️ **Per-visitor rate limit.** Translate and chat share one budget (default **5/min**), keyed by client IP.
- ✂️ **Output & input capped.** Free responses are capped at `FREE_MAX_TOKENS`, input at `MAX_TEXT_LENGTH`, and images at `FREE_MAX_IMAGES`.

Owner and BYOK traffic bypass the free limit entirely — they use their own key with full model choice.

```text
FREE_TIER_ENABLED=true      # master switch (needs FREE_PROVIDER's key set)
FREE_PROVIDER=cerebras
FREE_MODEL=gemma-4-31b
FREE_RATE_LIMIT=5           # free requests per visitor per minute
FREE_MAX_TOKENS=2048        # max output tokens per free request
FREE_MAX_IMAGES=2           # max images per free chat request
FREE_MAX_INPUT_CHARS=16000  # max total input chars (chat text + system prompt)
```

> **Behind a reverse proxy, set `TRUST_PROXY`** (e.g. `TRUST_PROXY=1`) so the rate limit is counted per real visitor IP. Without it, everyone shares the proxy's IP and the 5/min budget becomes global.

## Environment variables (optional)

Copy `.env.example` to `.env` and fill in what you need. Keys added in the UI take priority over these.

```text
HOST=0.0.0.0
PORT=8080
MAX_TEXT_LENGTH=8000
DEFAULT_PROVIDER=cerebras

CEREBRAS_API_KEY=
OPENROUTER_API_KEY=
GOOGLE_API_KEY=

OWNER_USERNAME=
OWNER_PASSWORD=
SESSION_TTL_HOURS=720

FREE_TIER_ENABLED=true
FREE_PROVIDER=cerebras
FREE_MODEL=gemma-4-31b
FREE_RATE_LIMIT=5
FREE_MAX_TOKENS=2048
FREE_MAX_IMAGES=2
FREE_MAX_INPUT_CHARS=16000
```

## Live Translate (voice)

The **Live** tab does real-time speech-to-speech translation using Google's Live API. Speak into the mic and the translation is spoken back and transcribed live.

- Needs a **Google AI Studio** key: your own (from **Your API Key**) or, if you're the logged-in owner, the server's Google key.
- The microphone only works on a **secure origin**: `localhost` or an `https://` URL. Over plain `http://` on a public IP, browsers block mic access.
- Audio streams to the server, which proxies to Google, so the key stays server-side when using the owner key.

## Security

- `.env` and `data/` are git-ignored — no API keys are ever committed.
- BYOK keys stay in the visitor's own browser and are never written to server-side storage.
- Owner-configured keys stay on the server and require the owner login (when configured) to view or use.
- Set `OWNER_USERNAME` / `OWNER_PASSWORD` before exposing the app publicly, or anyone could spend the keys you configured.

## License

Licensed under the [Apache License 2.0](LICENSE).

---

<div dir="rtl">

# مترجم (توضیحات فارسی)

ترجمه‌ی طبیعی و وفادار به معنا، به‌همراه چت هوش مصنوعی، برای گفتگوی راحت و مطمئن با تمام دنیا.

هدف از ساخت این برنامه ساده است: ترجمه‌ی متن **بدون از دست دادن معنی کلمات**، با زبانی **کاملاً طبیعی** در تک‌تک جمله‌ها، تا **گفتگوی راحت و ایمن با دنیا** برای همه ممکن شود.

**دمو و استفاده:** https://translate.raminexch.store/

> این آدرس ممکن است بعداً تغییر کند؛ مشکلی نیست، برنامه روی هر آدرسی مثل هم کار می‌کند.

## این برنامه چه می‌کند؟

- 🌍 پشتیبانی از **بیش از ۲۵ زبان** با ترجمه‌ی روان و انسانی (نه کلمه‌به‌کلمه).
- 🧠 **اولویت با معنا** — لحن، ظرافت، اصطلاحات و منظور حفظ می‌شود تا چیزی در ترجمه گم نشود.
- 💬 **چت هوش مصنوعی** با پشتیبانی از تصویر.
- 🎙️ **ترجمه‌ی زنده‌ی صدا** — حرف بزنید و ترجمه را همان لحظه بشنوید.
- 🌐 رابط دوزبانه (فارسی / انگلیسی) با تم روشن و تیره.
- 📱 قابل نصب مثل یک اپلیکیشن واقعی.

## کلید API خودتان را وارد کنید — چیزی ذخیره نمی‌شود

برنامه را باز کنید، روی دکمه‌ی ⚙ **تنظیمات** بزنید و کلید API خودتان را در بخش **کلید API شما** وارد کنید.

**هیچ چیزی ذخیره نمی‌شود.** کلید شما فقط در **مرورگر خودتان** می‌ماند و مستقیماً همراه درخواست‌های خودتان ارسال می‌شود. این کلید **هرگز** روی سرور ذخیره نمی‌شود، **هرگز** لاگ نمی‌شود و **هرگز** با کسی به اشتراک گذاشته نمی‌شود. اطلاعات مرورگر را پاک کنید و کلید هم پاک می‌شود. این موضوع عمدی است تا با خیال کاملاً راحت از برنامه استفاده کنید.

کلید رایگان را می‌توانید از این سرویس‌ها بگیرید:

- **Cerebras** — از [cloud.cerebras.ai](https://cloud.cerebras.ai) (بسیار سریع)
- **OpenRouter** — از [openrouter.ai/keys](https://openrouter.ai/keys) (مدل‌های رایگان به‌صورت خودکار انتخاب می‌شوند)
- **Google AI Studio** — از [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (برای ترجمه‌ی زنده‌ی صدا لازم است)

مراحل: انتخاب سرویس ← وارد کردن کلید ← **ذخیره کلید** ← **تست** ← **استفاده**.

## نصب به‌عنوان اپلیکیشن (Add to Home)

برای استفاده‌ی راحت‌تر، برنامه را مثل یک اپ روی گوشی نصب کنید:

- **آیفون / آیپد (Safari):** روی آیکون **Share** بزنید و سپس **Add to Home Screen** را انتخاب کنید.
- **اندروید (Chrome):** روی منوی **⋮** بزنید و سپس **Add to Home screen** یا **نصب برنامه** را انتخاب کنید.
- **دسکتاپ (Chrome / Edge):** روی آیکون **نصب** در نوار آدرس کلیک کنید.

بعد از آن، برنامه تمام‌صفحه و با آیکون مخصوص خودش باز می‌شود و دقیقاً مثل یک اپ واقعی کار می‌کند.

## اجرای شخصی (Self-host)

```bash
git clone <your-repo-url>
cd translator
npm install
npm start
```

سپس آدرس **http://localhost:8080** را باز کنید و در تنظیمات ⚙ کلید خود را اضافه کنید. نیازی به فایل تنظیمات نیست.

## برای مدیر سرور: محافظت از کلیدهای خودتان

اگر برنامه را عمومی منتشر می‌کنید، می‌توانید بگذارید بازدیدکننده‌ها با کلید **خودشان** کار کنند و کلیدهای **شما** پشت یک لاگین محافظت بماند. در فایل `.env` این‌ها را تنظیم کنید:

```text
OWNER_USERNAME=you
OWNER_PASSWORD=a-strong-password
SESSION_TTL_HOURS=720
```

با تنظیم هر دو، بخش **API Providers** همیشه قفل (🔒) نشان داده می‌شود تا زمانی که همان نام‌کاربری و رمز درست وارد شود. اگر خالی بمانند، برنامه بدون لاگین کار می‌کند (مناسب استفاده‌ی شخصی/محلی).

## استفاده‌ی رایگان برای هر بازدیدکننده، بدون لو رفتن کلید

می‌توانید به هر بازدیدکننده اجازه دهید بدون کلید و بدون لاگین، با **یک مدل رایگان روی سرور** کار کند و بقیه‌ی امکانات پشت لاگین مالک بماند. به‌صورت پیش‌فرض این یعنی **مدل Gemma 4 روی Cerebras، ۵ درخواست در دقیقه برای هر بازدیدکننده**.

هر درخواست رایگان طوری محدود می‌شود که نتوان از کلید مشترک سوءاستفاده کرد یا آن را تخلیه کرد:

- 🔒 **کلید هرگز به مرورگر فرستاده نمی‌شود.** درخواست‌های رایگان سمت سرور پروکسی می‌شوند.
- 🎯 **مدل قفل است.** کاربر نمی‌تواند مدل گران‌تری انتخاب کند؛ سرور همیشه `FREE_MODEL` را استفاده می‌کند.
- ⏱️ **محدودیت به‌ازای هر بازدیدکننده.** ترجمه و چت روی یک سقف مشترک (پیش‌فرض ۵ در دقیقه) بر اساس IP.
- ✂️ **سقف خروجی و ورودی.** پاسخ رایگان تا `FREE_MAX_TOKENS`، ورودی تا `MAX_TEXT_LENGTH` و تصویر تا `FREE_MAX_IMAGES`.

کاربرانی که کلید خودشان را وارد می‌کنند یا مالک لاگین‌کرده، اصلاً مشمول این محدودیت رایگان نیستند.

```text
FREE_TIER_ENABLED=true
FREE_PROVIDER=cerebras
FREE_MODEL=gemma-4-31b
FREE_RATE_LIMIT=5
FREE_MAX_TOKENS=2048
FREE_MAX_IMAGES=2
FREE_MAX_INPUT_CHARS=16000
```

> **پشت پروکسی حتماً `TRUST_PROXY` را تنظیم کنید** (مثلاً `TRUST_PROXY=1`) تا محدودیت بر اساس IP واقعی هر کاربر شمرده شود، نه IP پروکسی.

## امنیت

- فایل‌های `.env` و `data/` در گیت نادیده گرفته می‌شوند — هیچ کلیدی هرگز کامیت نمی‌شود.
- کلید BYOK فقط در مرورگر بازدیدکننده می‌ماند و روی سرور ذخیره نمی‌شود.
- قبل از انتشار عمومی، حتماً `OWNER_USERNAME` و `OWNER_PASSWORD` را تنظیم کنید.

## مجوز

تحت مجوز [Apache License 2.0](LICENSE) منتشر شده است.

</div>
