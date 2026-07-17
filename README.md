# Translator

A mobile-first multilingual translator, AI chat, and music-learning companion built around openly licensed music and user-connected Spotify playlists. Translator combines natural translation with synchronized lyrics, contextual Persian translation, personal learning collections, artist catalogs, and optional 24/7 audio radio.

[Live app](https://translate.raminexch.store) · [Report a bug](https://github.com/Kusarok/translator/issues) · [Security](SECURITY.md) · [Privacy](PRIVACY.md)

> This repository contains application source code only. Runtime databases, downloaded media, lyrics, user data, OAuth secrets, provider keys, and deployment-specific radio sources belong in ignored local configuration and storage.

## Highlights

### Translation and conversation

- Natural multilingual translation with automatic source-language detection.
- AI chat with image support.
- Live speech translation and speech-to-text.
- Cerebras, OpenRouter, Google, and Groq provider support.
- Bring-your-own-key mode; browser-provided keys are not persisted server-side.
- Installable PWA with English and Persian interface options.

### Music and language learning

The music experience is designed as a guided language-learning journey. Learners can explore a curated catalog of openly licensed vocal music or connect Spotify to bring their own playlist context, then listen, follow synchronized lyrics, understand each line in Persian, and build a personal study routine around the songs they enjoy.

- Curated open-music catalogs with recorded license evidence and creator attribution.
- Spotify account connection for personal playlist, track, artist, album, and artwork context.
- Search by song, artist, or lyric line across suitable learning material.
- Shared preparation cache so an eligible song already available to the community opens quickly for everyone.
- Synchronized original lyrics with contextual multilingual-to-Persian translation.
- Artist catalogs whose songs are checked for playable audio and usable lyrics before appearing.
- Personal learning playlists, recent plays, favorites, and progress.
- Configurable daily limit for preparing previously uncached songs.
- Optional audio-only live radio with background Media Session controls.
- Guest listening for verified open-license songs and the deployment radio catalog; accounts are only required for personal libraries and non-public catalog items.
- Private user-saved HTTPS radio links with editable station names.

## Architecture

```text
Browser / installed PWA
        |
        v
Express web application :8080
  |-- translation, chat, accounts and OAuth
  |-- /api/media  ------> media worker :8090 ------> SQLite + data/
  `-- /api/radio -------> radio worker :8091 ------> shared audio stream
```

The web process is the only service that should be internet-facing. Media and radio workers should remain on loopback or a private network. Generated data is stored under `data/` and is intentionally excluded from Git.

## Prerequisites

Required:

- Linux, macOS, or Windows with a Unix-like shell.
- Node.js **22.13 or newer** (`node:sqlite` is used by the media library).
- npm.

Required for music preparation:

- Python 3 with the `venv` module.
- FFmpeg and FFprobe.
- Enough local disk space for the shared media cache.

Optional:

- A provider API key for AI translation/chat features.
- Google OAuth credentials for Google sign-in.
- Spotify developer credentials for playlist connection.
- systemd and a reverse proxy for production deployment.

On Ubuntu/Debian, the system packages can be installed with:

```bash
sudo apt update
sudo apt install -y ffmpeg python3 python3-venv
```

Install Node.js from an official/current distribution that provides Node 22.13+.

## Quick start

```bash
git clone https://github.com/Kusarok/translator.git
cd translator
npm ci
cp .env.example .env
npm run media:install
npm start
```

Open <http://localhost:8080>. `npm start` starts the web, media, and radio processes when equivalent systemd services are not already active.

The translation interface can work with a key entered in Settings. Music features need FFmpeg and the Python media tools installed by `npm run media:install`.

## Configuration

All secrets must be stored in `.env`, a secret manager, or service environment variables. Never commit a populated environment file.

Common settings:

| Variable | Purpose | Default |
| --- | --- | --- |
| `HOST`, `PORT` | Public web listener | `0.0.0.0`, `8080` |
| `TRUST_PROXY` | Trust depth/address behind a reverse proxy | disabled |
| `APP_DATA_DIR` | Accounts and application data root | `./data` |
| `MEDIA_WORKER_URL` | Private media-worker URL | `http://127.0.0.1:8090` |
| `RADIO_WORKER_URL` | Private radio-worker URL | `http://127.0.0.1:8091` |
| `DAILY_NEW_SONG_LIMIT` | New uncached songs per user per UTC day | `5` |
| `SESSION_TTL_HOURS` | Account session lifetime | `720` |
| `FREE_TIER_ENABLED` | Enable the server-funded provider tier | `true` |
| `FREE_RATE_LIMIT` | Free translation/chat requests per visitor/minute | `5` |

Provider keys:

```dotenv
CEREBRAS_API_KEY=
OPENROUTER_API_KEY=
GOOGLE_API_KEY=
GROQ_API_KEY=
```

### Accounts and Google sign-in

Email/password registration works locally without OAuth. Passwords are salted and hashed with scrypt. To enable Google sign-in, create a Google OAuth Web Application and configure:

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://your-domain.example/api/auth/google/callback
```

The redirect URI must exactly match the authorized URI in Google Cloud. Use HTTPS in production.

### Spotify playlist connection

```dotenv
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=https://your-domain.example/api/media/spotify/callback
```

The Spotify connection lets learners bring the structure of their own playlists into the learning experience. Track, artist, album, and artwork context remains attributed and linked to Spotify, while learning availability is determined independently by the deployment's reviewed music and lyrics sources.

### Live radio

Radio source addresses are deployment settings and are not included in the repository. Put comma-separated HTTPS HLS sources in `.env` or the optional git-ignored `.env.radio`:

```dotenv
RADIO_KURDISH_URLS=https://licensed.example/kurdish.m3u8
RADIO_PERSIAN_NOSTALGIA_URLS=https://licensed.example/nostalgia.m3u8
RADIO_NAVAHANG_URLS=https://primary.example/live.m3u8,https://backup.example/live.m3u8
RADIO_JAVAN_URLS=https://licensed.example/javan.m3u8
```

Only configure streams you are authorized to access and relay. A station without a configured source is omitted from the public station list.

The deployment radio catalog is available without signing in. Signed-in listeners can also save their own HTTPS audio stream links, rename them, and remove them later; these personal links stay attached to that account and are never added to the shared station catalog. Browser playback of a personal HLS source still depends on that source permitting browser access.

See [.env.example](.env.example) for every setting and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production installation.

## Open music catalog

Openly licensed vocal music is the foundation of the built-in learning catalog. The importer accepts a recording only when it has clear license evidence, playable vocal audio, lyrics suitable for translation and synchronized study, and stable source identifiers.

```bash
npm run music:sync-open -- --artist "Artist name"
```

Every accepted song keeps its creator, source, license link, and relevant attribution visible. Recording, composition, lyrics, artwork, and translation permissions are reviewed separately so learners receive a catalog that is both useful and respectful of the people who created it.

## Data layout

Runtime storage stays inside this project by default:

```text
data/
  app-secret.key  local encryption key (mode 0600)
  database/       accounts, sessions, personal stations and media metadata
  media/          prepared media
  tracks/         per-track records
  lyrics/         source lyrics
  translations/   generated translations
  artwork/        cached artwork
  jobs/           durable background jobs
  radio/          radio-worker buffers
```

`npm run backup` creates a consistent local metadata snapshot under ignored `backups/`. It includes databases, licenses, lyrics, translations, artwork and the local encryption key, but intentionally excludes the large `data/media/` audio cache. Keep an additional filesystem backup if prepared audio must survive disk loss. Neither runtime data nor backups belong in source control.

## Commands

| Command | Description |
| --- | --- |
| `npm start` | Start the complete local application |
| `npm run start:web` | Start only the public web process |
| `npm run start:media` | Start only the media worker |
| `node services/radio-worker/server.js` | Start only the radio worker |
| `npm run media:install` | Create the Python environment and install yt-dlp/spotDL |
| `npm run music:sync-open` | Import an explicitly licensed open catalog |
| `npm run backup` | Create a local metadata/database backup |
| `npm test` | Run the Node test suite |

## Production checklist

Before exposing a deployment:

1. Use HTTPS and set `TRUST_PROXY` correctly.
2. Generate unique provider/OAuth credentials and keep them outside Git.
3. Restrict worker ports to loopback/private networking.
4. Configure `OWNER_USERNAME` and `OWNER_PASSWORD` if server-funded keys are enabled.
5. Enable `translator-backup.timer` and separately back up `data/media/` when cached audio must be retained.
6. Confirm licenses for every media source, lyric source, artwork, and radio stream.
7. Publish a deployment-specific privacy policy and contact method.
8. Run `npm test`, review `git diff`, and scan Git history for secrets.

The complete checklist is in [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

## Music learning and creator respect

Translator's music features are intended to make language learning more engaging through openly licensed catalogs, personal playlist connections, synchronized lyrics, and contextual translation. The product is designed to help learners discover creators, understand songs, and continue listening through properly attributed sources.

Deployments curate the music, lyrics, artwork, and radio sources they are permitted to provide and preserve the attribution required by each source. Third-party names and trademarks identify supported integrations and remain the property of their respective owners.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for software notices.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Do not report credentials or exploitable vulnerabilities in a public issue; follow [SECURITY.md](SECURITY.md) instead.

## License

Copyright belongs to the respective contributors. The project is licensed under the [Apache License 2.0](LICENSE).

---

<div dir="rtl">

## راه‌اندازی سریع فارسی

Translator یک برنامه موبایل‌محور برای ترجمه، گفتگوی هوش مصنوعی و یادگیری زبان با موسیقی است. بخش موسیقی بر پایه آثار دارای مجوز باز و اتصال حساب Spotify طراحی شده تا کاربر بتواند آهنگ‌های مناسب را پیدا کند، همراه متن همگام گوش دهد، مفهوم هر خط را به فارسی بفهمد و پلی‌لیست آموزشی خودش را بسازد. کتابخانه آماده‌شده بین کاربران مشترک است، اما پلی‌لیست‌ها، سابقه پخش و پیشرفت هر کاربر جدا باقی می‌ماند.

### پیش‌نیازها

- Node.js نسخه 22.13 یا جدیدتر
- npm
- برای بخش موسیقی: Python 3، ماژول `venv` و FFmpeg

```bash
git clone https://github.com/Kusarok/translator.git
cd translator
npm ci
cp .env.example .env
npm run media:install
npm start
```

سپس آدرس `http://localhost:8080` را باز کنید. کلیدهای خصوصی، اطلاعات OAuth، دیتابیس، آهنگ‌ها و Lyrics نباید در Git قرار بگیرند و به‌صورت پیش‌فرض در `.env` و `data/` نگهداری می‌شوند.

برای استقرار واقعی، فایل [راهنمای استقرار](docs/DEPLOYMENT.md)، [سیاست امنیت](SECURITY.md)، [حریم خصوصی](PRIVACY.md) و [چک‌لیست انتشار](docs/RELEASE_CHECKLIST.md) را بخوانید.

</div>
