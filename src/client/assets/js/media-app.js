import { t } from "./i18n.js";
import { getSpotifyLyrics, translateSpotifyLyrics } from "./api.js";
import { getRequestPayload } from "./byok.js";

const el = Object.fromEntries(Object.entries({
  form: "mediaImportForm", input: "mediaUrl", submit: "mediaSubmit", status: "mediaStatusCard",
  source: "mediaSourceBadge", statusLabel: "mediaStatusLabel", statusText: "mediaStatusText",
  progress: "mediaProgressBar", result: "mediaResult", resultSource: "mediaResultSource",
  title: "mediaResultTitle", meta: "mediaResultMeta", artwork: "mediaArtwork", player: "mediaPlayerWrap",
  disclosure: "mediaDisclosure", original: "mediaOriginal", remove: "mediaRemove", start: "mediaStartLearning",
  lesson: "mediaLesson", lyrics: "mediaLyrics", lessonClose: "mediaLessonClose",
  lessonTitle: "mediaLessonTitle", lessonArtist: "mediaLessonArtist"
}).map(([key, id]) => [key, document.getElementById(id)]));

let track = null;
let controller = null;
let api = null;
let activeIndex = -1;
let spotifyApiPromise = null;
let playback = { position: 0, updatedAt: 0, paused: true };
let syncFrame = 0;
const SESSION_KEY = "spotify.learn.track.v1";

const loadSpotifyApi = () => {
  if (api) return Promise.resolve(api);
  if (spotifyApiPromise) return spotifyApiPromise;
  spotifyApiPromise = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Spotify player API timed out")), 10000);
    window.onSpotifyIframeApiReady = (iframeApi) => { window.clearTimeout(timeout); api = iframeApi; resolve(iframeApi); };
    const script = document.createElement("script");
    script.src = "https://open.spotify.com/embed/iframe-api/v1";
    script.async = true;
    script.addEventListener("error", () => reject(new Error("Spotify player could not be loaded")), { once: true });
    document.head.append(script);
  }).then((value) => value, (error) => { spotifyApiPromise = null; throw error; });
  return spotifyApiPromise;
};

const mountFallbackPlayer = () => {
  const iframe = document.createElement("iframe");
  iframe.src = `https://open.spotify.com/embed/track/${track.spotifyId}?utm_source=generator&theme=0`;
  iframe.title = `${track.title} — Spotify player`;
  iframe.width = "100%";
  iframe.height = "152";
  iframe.loading = "eager";
  iframe.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  el.player.replaceChildren(iframe);
};

const status = (label, message, progress, error = false) => {
  el.status.hidden = false;
  el.source.textContent = "Spotify";
  el.statusLabel.textContent = label;
  el.statusText.textContent = message;
  el.progress.style.width = `${progress}%`;
  el.status.classList.toggle("is-error", error);
};

const setBusy = (busy) => {
  el.input.disabled = busy;
  el.submit.disabled = busy;
  el.submit.classList.toggle("is-loading", busy);
};

const showPreparedTrack = () => {
  el.resultSource.textContent = "Spotify · LRCLIB";
  el.title.textContent = track.title;
  el.meta.textContent = `${track.artist}${track.album ? ` · ${track.album}` : ""}`;
  el.lessonTitle.textContent = track.title;
  el.lessonArtist.textContent = track.artist;
  el.original.href = track.sourceUrl;
  if (track.artwork) { el.artwork.src = track.artwork; el.artwork.hidden = false; }
  el.lesson.hidden = true;
  el.start.hidden = false;
  el.result.hidden = false;
};

const renderLyrics = () => {
  el.lyrics.replaceChildren(...track.lines.map((line, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "lyric-pair";
    row.dataset.index = index;
    row.innerHTML = `<span class="lyric-original" dir="ltr"></span><span class="lyric-translation" dir="rtl" lang="fa"></span>`;
    row.children[0].textContent = line.text || "♪";
    row.children[1].textContent = line.translation || "";
    row.addEventListener("click", () => controller?.seek(Math.floor(line.time)));
    return row;
  }));
};

const syncAt = (seconds) => {
  let next = -1;
  for (let i = 0; i < track.lines.length; i += 1) {
    if (track.lines[i].time <= seconds + 0.08) next = i;
    else break;
  }
  if (next === activeIndex) return;
  el.lyrics.children[activeIndex]?.classList.remove("is-active");
  activeIndex = next;
  const row = el.lyrics.children[activeIndex];
  row?.classList.add("is-active");
  if (row) {
    const target = row.offsetTop - (el.lyrics.clientHeight - row.offsetHeight) / 2;
    el.lyrics.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }
};

const syncLoop = () => {
  const elapsed = playback.paused ? 0 : performance.now() - playback.updatedAt;
  syncAt((playback.position + elapsed) / 1000);
  syncFrame = requestAnimationFrame(syncLoop);
};

const mountPlayer = () => {
  if (!api || !track || controller) return;
  api.createController(el.player, { uri: `spotify:track:${track.spotifyId}`, width: "100%", height: 152 }, (embed) => {
    controller = embed;
    embed.addListener("playback_update", (event) => {
      playback = {
        position: Number(event.data?.position || 0),
        updatedAt: performance.now(),
        paused: Boolean(event.data?.isPaused || event.data?.isBuffering)
      };
      syncAt(playback.position / 1000);
    });
    cancelAnimationFrame(syncFrame);
    syncFrame = requestAnimationFrame(syncLoop);
  });
};

const submit = async (event) => {
  event.preventDefault();
  controller?.destroy(); controller = null; track = null; activeIndex = -1;
  cancelAnimationFrame(syncFrame);
  el.player.replaceChildren();
  el.result.hidden = true;
  setBusy(true);
  try {
    status("Checking", "Reading the Spotify track and finding an exact lyrics match…", 22);
    track = await getSpotifyLyrics(el.input.value);
    status("Translating", "Translating each lyric line to Persian without changing timestamps…", 62);
    const texts = track.lines.map((line) => line.text);
    const result = await translateSpotifyLyrics({ lines: texts, ...getRequestPayload() });
    track.lines = track.lines.map((line, index) => ({ ...line, translation: result.translations[index] }));
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(track));
    showPreparedTrack();
    status("Ready", "Lyrics, timestamps and Persian translation are ready.", 100);
    el.result.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    status("Failed", error.message, 0, true);
  } finally { setBusy(false); }
};

const startLesson = async () => {
  el.start.hidden = true;
  el.lesson.hidden = false;
  document.body.classList.add("media-player-open");
  if (track.artwork) el.lesson.style.setProperty("--lesson-art", `url("${track.artwork.replaceAll('"', '')}")`);
  renderLyrics();
  if (controller) {
    controller.resume();
    cancelAnimationFrame(syncFrame);
    syncFrame = requestAnimationFrame(syncLoop);
    return;
  }
  try {
    await loadSpotifyApi();
    mountPlayer();
  } catch (error) {
    mountFallbackPlayer();
    status("Player limited", "Spotify controls are available, but live lyric highlighting may be limited in this browser.", 100);
  }
};

const closeLesson = () => {
  document.body.classList.remove("media-player-open");
  el.lesson.hidden = true;
  el.start.hidden = false;
  controller?.pause();
  cancelAnimationFrame(syncFrame);
};

const remove = () => {
  controller?.destroy(); controller = null; track = null;
  sessionStorage.removeItem(SESSION_KEY);
  document.body.classList.remove("media-player-open");
  cancelAnimationFrame(syncFrame);
  el.result.hidden = true; el.status.hidden = true; el.player.replaceChildren(); el.lyrics.replaceChildren();
  el.input.focus();
};

export const initMedia = () => {
  el.form?.addEventListener("submit", submit);
  el.start?.addEventListener("click", startLesson);
  el.lessonClose?.addEventListener("click", closeLesson);
  el.remove?.addEventListener("click", remove);
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (saved?.spotifyId && Array.isArray(saved.lines)) {
      track = saved;
      el.input.value = saved.sourceUrl || "";
      showPreparedTrack();
      status("Ready", "Your last prepared lesson was restored.", 100);
    }
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }
};
