# Media Learning MVP: Architecture and Progress

## Purpose

This document is the handoff and progress log for the first media-learning release. It must be updated whenever a meaningful implementation stage is completed, when an architectural decision changes, or when a new blocker is discovered.

The product goal is to let a user submit a public, supported social-media URL, retrieve the authorized media, present it in a friendly audio/video player, and optionally download the prepared file. Synchronized lyrics and translation will be attached to the resulting stable media ID in later stages.

## Supported Platform Scope

The adapter contract covers these platforms:

- YouTube and YouTube Music
- X (Twitter)
- Instagram
- Facebook
- Spotify
- TikTok

YouTube, X, Instagram, Facebook, and TikTok use isolated platform adapters backed by `yt-dlp`. Spotify is different: `spotDL` reads Spotify metadata and finds a corresponding audio source, normally on YouTube Music. The UI and API must disclose that distinction.

Only public, user-authorized content is in scope. Private posts, account-cookie ingestion, DRM circumvention, and login bypasses are explicitly out of scope.

## Service Boundaries

```text
Browser
  -> Translator web/API service (:8080)
      -> Media worker (loopback :8090)
          -> platform adapter registry
          -> yt-dlp or spotDL
          -> FFmpeg / ffprobe
          -> local storage adapter
```

The browser never contacts the worker directly. The existing Translator server proxies job, stream, download, and delete operations. This keeps the worker private and allows a later remote worker implementation without changing the browser API.

## Security Boundaries

- Only `http:` and `https:` URLs are accepted.
- Hosts must match an explicit supported-platform allowlist.
- Credentials embedded in URLs are rejected.
- Playlists are disabled for the first release to bound resource use.
- File size, duration, execution time, and concurrent jobs are bounded.
- Downloader arguments are passed as an argument array; user input is never interpolated into a shell command.
- Worker storage is isolated under `data/media` and files are served only by generated media IDs.
- Temporary and expired files have a configurable retention period.

## Normalized Job States

```text
queued -> inspecting -> downloading -> processing -> completed
                                                \-> failed
```

Every job exposes a platform, stage, progress percentage, safe public metadata, media result, and a user-readable error. The UI polls the job endpoint until it reaches a terminal state.

## Stage Log

### Stage 0: Repository and Runtime Audit

Status: **completed on 2026-07-10**

Verified facts:

- The existing application is an Express 5 / Node.js 24 application served on port 8080.
- The client is a framework-free modular PWA with Translator, Chat, and Live views.
- FFmpeg and ffprobe are installed on the server.
- Python 3.12 is installed.
- Docker is installed, but the first development deployment will not require Docker.
- `yt-dlp` and `spotDL` were not installed at audit time.
- No application process was listening on port 8080 at audit time.
- The only pre-existing uncommitted file was `MEDIA_LYRICS_PLAN.md`.

### Stage 1: Architecture and Handoff Documentation

Status: **completed on 2026-07-10**

Decisions:

- Use a separate loopback media-worker process.
- Use platform-specific adapters with a shared downloader implementation.
- Use a local storage adapter for the MVP and preserve a replaceable storage boundary.
- Start both services through one development command while retaining separate processes.
- Add lyrics and transcription later by referencing the generated media ID.

### Stage 2: Media Worker and API

Status: **completed on 2026-07-10**

Delivered:

- Adapter registry for all six requested platform groups
- Background job queue
- yt-dlp and spotDL runners
- Range-capable streaming and explicit download endpoints
- Translator-server proxy routes
- Health and capability reporting

Implementation notes:

- Every requested platform has its own adapter module under `services/media-worker/adapters`.
- YouTube, YouTube Music, X, Instagram, Facebook, and TikTok use the shared yt-dlp runner.
- Spotify uses the separate spotDL runner and carries a source disclosure into the UI.
- Jobs run outside the HTTP request lifecycle through a bounded in-memory queue.
- The worker exposes byte-range streaming and attachment download endpoints.
- The main Express application proxies all worker operations under `/api/media`.
- Media is retained under `data/media` and expires after 24 hours by default.

### Stage 3: Media User Interface

Status: **completed on 2026-07-10**

Delivered:

- A Media/Learn view in the existing application mode menu
- URL submission and platform hints
- Friendly progress states
- Thumbnail and metadata card
- Native audio/video playback
- Download and delete actions
- Responsive English and Persian presentation

The new `Learn` mode is integrated into the existing mode menu and PWA layout. It includes URL submission, platform chips, polling progress, source metadata, thumbnail, native audio/video controls, download, deletion, Spotify disclosure, and a reserved synchronized-lyrics area.

### Stage 4: Verification

Status: **completed on 2026-07-10**

Required evidence:

- Unit tests for URL classification and rejection
- API tests for job creation, validation, status, and missing media
- Successful worker health check with downloader capability reporting
- At least one real public-media end-to-end retrieval and playback check
- Range request verification for browser seeking
- Main application regression smoke test

Evidence collected on 2026-07-10:

- `npm test`: 6 tests passed, 0 failed.
- All JavaScript files passed `node --check`.
- `git diff --check` reported no whitespace errors.
- yt-dlp 2026.07.04 and spotDL 4.5.0 were installed in the service virtual environment.
- A real public X video completed the full inspect and download pipeline.
- The resulting MP4 was 1,404,023 bytes and reported a duration of 15.488 seconds.
- Direct worker and main API proxy Range requests returned HTTP 206 with the requested 1,024 bytes.
- The legacy YouTube test video was unavailable. A second public YouTube video reached the extractor but YouTube blocked this server IP with its bot-verification response. Alternate anonymous player clients were also blocked. No account cookie was added because account-cookie ingestion is explicitly outside the safe public-content scope.

Final verification evidence:

- The final revision was restarted with both child services healthy.
- `127.0.0.1:8090` is bound only on loopback and `0.0.0.0:8080` serves the web application.
- Final local media health returned all six adapters and both downloader capabilities.
- The served HTML contains the Learn menu option, `mediaView`, and `mediaImportForm`.
- A second real X job was submitted through `http://104.168.4.11:8080`, reached `completed`, and produced a playable MP4.
- A public-address Range request returned HTTP 206, `Content-Range: bytes 0-2047/1404023`, and exactly 2,048 bytes.
- A public-address download request returned HTTP 200, the full 1,404,023-byte content length, and an attachment filename.

### Stage 5: Public Development Deployment

Status: **completed on 2026-07-10**

Completion requires:

- Both services running in the background
- The web application listening on `0.0.0.0:8080`
- Local health checks passing
- Public verification at `http://104.168.4.11:8080`

Deployment evidence:

- Main application: listening on `0.0.0.0:8080`.
- Private media worker: listening on `127.0.0.1:8090`.
- Local home page response: HTTP 200.
- Public-IP home page response: HTTP 200.
- Public media API and stream tests passed as described in Stage 4.

The development processes are running in the active persistent execution session. They are intentionally not installed as an operating-system startup service because this deployment is for online development and the owner previously stopped permanent background execution.

## Next Agent Instructions

Read this file and `MEDIA_LYRICS_PLAN.md` before changing the media subsystem. Treat the worktree and running processes as authoritative. Update this stage log with concrete test evidence rather than marking a stage complete based only on code presence.

## Development Commands

```bash
npm install
npm run media:install
npm test
npm start
```

`npm start` launches two separate child processes: the private media worker on `127.0.0.1:8090` and the main application on `0.0.0.0:8080`. Use `npm run start:web` or `npm run start:media` when debugging one process independently.
