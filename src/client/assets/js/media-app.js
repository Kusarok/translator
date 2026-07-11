import { t } from "./i18n.js";
import { getSpotifyLyrics, translateSpotifyLyrics, createSearchMediaJob, getMediaJob, importSpotifyPlaylist, saveLearnProgress } from "./api.js";
import { getRequestPayload } from "./byok.js";
import { closeLearnAddSheet, initLearnLibrary, refreshLearnLibrary, showPlaylistPicker } from "./learn-library.js";

const el = Object.fromEntries(Object.entries({
  form: "mediaImportForm", input: "mediaUrl", submit: "mediaSubmit", status: "mediaStatusCard",
  source: "mediaSourceBadge", statusLabel: "mediaStatusLabel", statusText: "mediaStatusText",
  progress: "mediaProgressBar", result: "mediaResult", resultSource: "mediaResultSource",
  title: "mediaResultTitle", meta: "mediaResultMeta", artwork: "mediaArtwork", player: "mediaPlayerWrap",
  disclosure: "mediaDisclosure", original: "mediaOriginal", remove: "mediaRemove", start: "mediaStartLearning",
  view: "mediaView", resultBack: "mediaResultBack",
  addPlaylist: "mediaAddPlaylist",
  lesson: "mediaLesson", lyrics: "mediaLyrics", lessonClose: "mediaLessonClose",
  lessonTitle: "mediaLessonTitle", lessonArtist: "mediaLessonArtist", lessonCover: "mediaLessonCover"
}).map(([key, id]) => [key, document.getElementById(id)]));

let track = null;
let audioEl = null;
let jobPollTimer = null;
let activeIndex = -1;
let syncFrame = 0;
let scrubbing = false;
let repeatLine = false;
let speedIndex = 0;
let operationId = 0;
let requestController = null;
let sessionWriteTimer = 0;
let lastProgressSave = 0;
// Slow-first cycle: language learners lean on 0.75× / 0.5× to catch every syllable.
const SPEEDS = [1, 0.75, 0.5, 1.25, 1.5];
const player = {};
const SESSION_KEY = "translator_media_lesson";
const HISTORY_KEY = "translatorLearnLayer";
const HISTORY_VERSION_KEY = "translatorLearnHistoryVersion";
const HISTORY_VERSION = 2;
const LAYERS = new Set(["input", "result", "lesson"]);

// ---- Back-button integration ----
// The prepared result and the full-screen player each own one history entry, so pressing
// Back (hardware key, edge-swipe, or an in-app control) steps back through the learn flow
// instead of unloading the whole app. Each entry shares the same URL, so no real navigation
// happens — Back just fires popstate, and we run that layer's teardown.
const currentLayer = () => LAYERS.has(history.state?.[HISTORY_KEY]) ? history.state[HISTORY_KEY] : "input";
const historyState = (layer) => ({
  ...(history.state || {}),
  [HISTORY_KEY]: layer,
  [HISTORY_VERSION_KEY]: HISTORY_VERSION
});
const navigateTo = (layer) => {
  if (currentLayer() === layer) return;
  history.pushState(historyState(layer), "");
  applyLayer(layer);
};
const goBack = () => {
  if (currentLayer() === "input") return;
  history.back();
};

const persistTrack = () => {
  if (!track) return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(track));
};

const persistPlaybackSoon = () => {
  clearTimeout(sessionWriteTimer);
  sessionWriteTimer = setTimeout(() => {
    if (!track || !audioEl) return;
    track.playback = {
      currentTime: audioEl.currentTime,
      playbackRate: audioEl.playbackRate,
      repeatLine
    };
    persistTrack();
  }, 300);
};

const persistLearningProgress = (force = false) => {
  if (!track?.trackId || !audioEl) return;
  const now = Date.now();
  if (!force && now - lastProgressSave < 5000) return;
  lastProgressSave = now;
  const completionPercent = Number.isFinite(audioEl.duration) && audioEl.duration > 0
    ? Math.min(100, Math.round((audioEl.currentTime / audioEl.duration) * 100)) : 0;
  saveLearnProgress(track.trackId, {
    status: completionPercent >= 95 ? "completed" : "learning",
    playbackSeconds: audioEl.currentTime,
    completionPercent
  }).catch(() => {});
};

const fmtTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

// Fraction 0..1 of the seek bar under a pointer's x, clamped. Physical coords, so it
// stays correct even when the surrounding UI is right-to-left.
const barFraction = (clientX) => {
  const rect = player.bar.getBoundingClientRect();
  if (!rect.width) return 0;
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
};

const paintProgress = (fraction, current) => {
  player.fill.style.width = `${fraction * 100}%`;
  player.cur.textContent = fmtTime(current);
  player.bar.setAttribute("aria-valuenow", String(Math.floor(current)));
};

const updateProgress = () => {
  if (!audioEl || !player.bar) return;
  const dur = audioEl.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;
  player.dur.textContent = fmtTime(dur);
  player.bar.setAttribute("aria-valuemax", String(Math.floor(dur)));
  if (!scrubbing) paintProgress(audioEl.currentTime / dur, audioEl.currentTime);
  const buffered = audioEl.buffered;
  let end = 0;
  for (let i = 0; i < buffered.length; i += 1) {
    if (buffered.start(i) <= audioEl.currentTime + 0.25) end = Math.max(end, buffered.end(i));
  }
  player.buffered.style.width = `${Math.min(1, end / dur) * 100}%`;
};

// When line-repeat is armed, loop the currently highlighted lyric by jumping back to its
// start just before the next line begins.
const maybeRepeatLine = () => {
  if (!repeatLine || !audioEl || !track || activeIndex < 0) return;
  const next = activeIndex + 1 < track.lines.length
    ? track.lines[activeIndex + 1].time
    : (audioEl.duration || Infinity);
  if (audioEl.currentTime >= next - 0.06) audioEl.currentTime = track.lines[activeIndex].time;
};

const setPlaying = (playing) => {
  player.play?.classList.toggle("is-playing", playing);
  player.play?.setAttribute("aria-label", playing ? "Pause" : "Play");
};

const mountAudioPlayer = (streamUrl) => {
  scrubbing = false;
  repeatLine = false;
  speedIndex = 0;

  audioEl = document.createElement("audio");
  audioEl.className = "lp-audio";
  audioEl.preload = "auto";
  audioEl.src = streamUrl;
  const restoredTime = Number(track?.playback?.currentTime) || 0;
  audioEl.playbackRate = Number(track?.playback?.playbackRate) || 1;
  repeatLine = Boolean(track?.playback?.repeatLine);
  speedIndex = Math.max(0, SPEEDS.indexOf(audioEl.playbackRate));

  const ui = document.createElement("div");
  ui.className = "lesson-player";
  ui.innerHTML = `
    <div class="lp-seek">
      <span class="lp-time lp-cur">0:00</span>
      <div class="lp-bar" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">
        <div class="lp-buffered"></div>
        <div class="lp-fill"><span class="lp-thumb"></span></div>
      </div>
      <span class="lp-time lp-dur">0:00</span>
    </div>
    <div class="lp-controls">
      <button type="button" class="lp-chip lp-speed" aria-label="Playback speed">1&times;</button>
      <div class="lp-transport">
        <button type="button" class="lp-ctl lp-skip" data-skip="-10" aria-label="Back 10 seconds">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/><text x="12" y="16" text-anchor="middle" font-size="8" font-weight="800">10</text></svg>
        </button>
        <button type="button" class="lp-play" aria-label="Play">
          <svg class="i-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          <svg class="i-pause" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4" height="15" rx="1.3"/><rect x="14" y="4.5" width="4" height="15" rx="1.3"/></svg>
        </button>
        <button type="button" class="lp-ctl lp-skip" data-skip="10" aria-label="Forward 10 seconds">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/><text x="12" y="16" text-anchor="middle" font-size="8" font-weight="800">10</text></svg>
        </button>
      </div>
      <button type="button" class="lp-chip lp-repeat" aria-label="Repeat line" aria-pressed="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
      </button>
    </div>`;

  el.player.replaceChildren(audioEl, ui);

  player.bar = ui.querySelector(".lp-bar");
  player.fill = ui.querySelector(".lp-fill");
  player.buffered = ui.querySelector(".lp-buffered");
  player.cur = ui.querySelector(".lp-cur");
  player.dur = ui.querySelector(".lp-dur");
  player.play = ui.querySelector(".lp-play");
  player.speed = ui.querySelector(".lp-speed");
  player.repeat = ui.querySelector(".lp-repeat");
  player.speed.textContent = `${audioEl.playbackRate}×`;
  player.speed.classList.toggle("is-active", audioEl.playbackRate !== 1);
  player.repeat.classList.toggle("is-active", repeatLine);
  player.repeat.setAttribute("aria-pressed", repeatLine ? "true" : "false");

  player.play.addEventListener("click", () => {
    if (!audioEl) return;
    if (audioEl.paused) audioEl.play(); else audioEl.pause();
  });

  ui.querySelectorAll(".lp-skip").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!audioEl) return;
      const max = Number.isFinite(audioEl.duration) ? audioEl.duration : Infinity;
      audioEl.currentTime = Math.min(max, Math.max(0, audioEl.currentTime + Number(btn.dataset.skip)));
      updateProgress();
    });
  });

  player.speed.addEventListener("click", () => {
    speedIndex = (speedIndex + 1) % SPEEDS.length;
    const rate = SPEEDS[speedIndex];
    if (audioEl) audioEl.playbackRate = rate;
    player.speed.textContent = `${rate}×`;
    player.speed.classList.toggle("is-active", rate !== 1);
    persistPlaybackSoon();
    persistLearningProgress();
  });

  player.repeat.addEventListener("click", () => {
    repeatLine = !repeatLine;
    player.repeat.classList.toggle("is-active", repeatLine);
    player.repeat.setAttribute("aria-pressed", repeatLine ? "true" : "false");
    persistPlaybackSoon();
  });

  const previewAt = (clientX) => {
    const fraction = barFraction(clientX);
    const dur = Number.isFinite(audioEl?.duration) ? audioEl.duration : 0;
    paintProgress(fraction, fraction * dur);
  };
  player.bar.addEventListener("pointerdown", (event) => {
    if (!audioEl) return;
    scrubbing = true;
    player.bar.classList.add("is-scrubbing");
    player.bar.setPointerCapture(event.pointerId);
    previewAt(event.clientX);
  });
  player.bar.addEventListener("pointermove", (event) => {
    if (scrubbing) previewAt(event.clientX);
  });
  const endScrub = (event) => {
    if (!scrubbing) return;
    scrubbing = false;
    player.bar.classList.remove("is-scrubbing");
    if (audioEl && Number.isFinite(audioEl.duration)) {
      audioEl.currentTime = barFraction(event.clientX) * audioEl.duration;
    }
  };
  player.bar.addEventListener("pointerup", endScrub);
  player.bar.addEventListener("pointercancel", endScrub);
  player.bar.addEventListener("keydown", (event) => {
    if (!audioEl || !Number.isFinite(audioEl.duration)) return;
    const step = event.shiftKey ? 10 : 5;
    if (event.key === "ArrowRight") audioEl.currentTime = Math.min(audioEl.duration, audioEl.currentTime + step);
    else if (event.key === "ArrowLeft") audioEl.currentTime = Math.max(0, audioEl.currentTime - step);
    else return;
    event.preventDefault();
    updateProgress();
  });

  audioEl.addEventListener("loadedmetadata", () => {
    if (restoredTime > 0 && Number.isFinite(audioEl.duration)) {
      audioEl.currentTime = Math.min(restoredTime, Math.max(0, audioEl.duration - 0.1));
    }
    updateProgress();
  }, { once: true });
  audioEl.addEventListener("durationchange", updateProgress);
  audioEl.addEventListener("progress", updateProgress);
  audioEl.addEventListener("timeupdate", () => {
    updateProgress();
    maybeRepeatLine();
    syncAt(audioEl.currentTime);
    persistPlaybackSoon();
    persistLearningProgress();
  });
  audioEl.addEventListener("play", () => {
    setPlaying(true);
    cancelAnimationFrame(syncFrame);
    syncFrame = requestAnimationFrame(syncLoop);
  });
  audioEl.addEventListener("pause", () => {
    setPlaying(false);
    cancelAnimationFrame(syncFrame);
    syncFrame = 0;
    persistLearningProgress(true);
  });
  audioEl.addEventListener("ended", () => setPlaying(false));

  updateProgress();
};

const pollMediaJob = (jobId, target, token, onDone) => {
  const poll = async () => {
    if (token !== operationId || track !== target) return;
    try {
      const job = await getMediaJob(jobId, requestController?.signal);
      if (token !== operationId || track !== target) return;
      if (job.status === "completed" && job.media) {
        target.mediaId = job.media.id;
        target.streamUrl = job.media.streamUrl;
        target.downloadUrl = job.media.downloadUrl;
        target.downloadError = null;
        persistTrack();
        onDone();
        return;
      }
      if (job.status === "failed") {
        target.downloadError = job.error || "Audio download failed.";
        persistTrack();
        onDone();
        return;
      }
      status("Downloading", `Downloading from YouTube Music… ${job.progress || 30}%`, job.progress || 30);
      jobPollTimer = setTimeout(poll, 1500);
    } catch (error) {
      if (error?.name === "AbortError" || token !== operationId || track !== target) return;
      jobPollTimer = setTimeout(poll, 3000);
    }
  };
  poll();
};

const startAudioDownload = (onDone) => {
  const target = track;
  const token = operationId;
  const query = `${target.artist} ${target.title} audio`;
  target.downloadError = null;
  target.streamUrl = "";
  persistTrack();
  createSearchMediaJob(query, target.sourceUrl, requestController?.signal)
    .then((job) => {
      if (token !== operationId || track !== target) return;
      target.jobId = job.id;
      persistTrack();
      pollMediaJob(job.id, target, token, onDone);
    })
    .catch((error) => {
      if (error?.name === "AbortError" || token !== operationId || track !== target) return;
      target.downloadError = "Could not start audio download from YouTube Music.";
      persistTrack();
      onDone();
    });
};

const status = (label, message, progress, error = false) => {
  el.status.hidden = false;
  el.source.textContent = "YouTube Music";
  el.statusLabel.textContent = label;
  el.statusText.textContent = message;
  el.progress.style.width = `${progress}%`;
  el.status.classList.toggle("is-error", error);
  // Pulse/shimmer only while a job is actively running — not at Ready (100%) or on error.
  el.status.classList.toggle("is-loading", !error && progress < 100);
};

const setBusy = (busy) => {
  el.input.disabled = busy;
  el.submit.disabled = busy;
  el.submit.classList.toggle("is-loading", busy);
};

const showPreparedTrack = () => {
  if (currentLayer() === "input") return;
  const ready = Boolean(track.streamUrl);
  el.resultSource.textContent = ready ? "YouTube Music · LRCLIB" : "Spotify metadata · LRCLIB";
  el.title.textContent = track.title;
  el.meta.textContent = `${track.artist}${track.album ? ` · ${track.album}` : ""}`;
  el.lessonTitle.textContent = track.title;
  el.lessonArtist.textContent = track.artist;
  el.original.href = track.sourceUrl;
  if (track.artwork) {
    el.artwork.src = track.artwork; el.artwork.hidden = false;
    el.result.style.setProperty("--result-art", `url("${track.artwork.replaceAll('"', '')}")`);
  } else {
    el.artwork.hidden = true;
    el.result.style.removeProperty("--result-art");
  }
  el.lesson.hidden = true;
  el.start.hidden = false;
  const failed = Boolean(track.downloadError);
  el.start.disabled = !ready && !failed;
  el.start.textContent = ready ? "Start learning" : failed ? "Retry audio" : "Preparing audio…";
  el.start.classList.toggle("is-waiting", !ready && !failed);
  el.result.hidden = false;
  el.view.classList.add("has-result");
  el.view.classList.remove("is-preparing");
  document.body.classList.add("media-result-open");
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
    row.addEventListener("click", () => {
      if (audioEl) {
        audioEl.currentTime = line.time;
        audioEl.play();
      }
    });
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
  if (audioEl && !audioEl.paused) {
    updateProgress();
    maybeRepeatLine();
    syncAt(audioEl.currentTime);
  }
  syncFrame = requestAnimationFrame(syncLoop);
};

const submit = async (event) => {
  event.preventDefault();
  if (/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\//i.test(el.input.value)) {
    closeLearnAddSheet();
    el.view.classList.add("is-preparing");
    status("Importing", "Reading your Spotify playlist…", 40);
    try {
      await importSpotifyPlaylist(el.input.value);
      await refreshLearnLibrary();
      el.view.classList.remove("is-preparing");
      el.status.hidden = true;
      el.input.value = "";
    } catch (error) {
      el.view.classList.remove("is-preparing");
      document.getElementById("learnAddSheet").hidden = false;
      const note = document.getElementById("learnSpotifyNote");
      if (note) note.textContent = error.message;
    }
    return;
  }
  closeLearnAddSheet();
  el.view.classList.add("is-preparing");
  operationId += 1;
  const token = operationId;
  requestController?.abort();
  requestController = new AbortController();
  cleanupPlayer();
  track = null; activeIndex = -1;
  cancelAnimationFrame(syncFrame);
  el.player.replaceChildren();
  el.result.hidden = true;
  setBusy(true);
  try {
    status("Checking", "Reading the Spotify track and finding an exact lyrics match…", 22);
    const prepared = await getSpotifyLyrics(el.input.value, requestController.signal);
    if (token !== operationId) return;
    track = prepared;
    if (!track.translationCached) {
      status("Translating", "Translating each lyric line to Persian without changing timestamps…", 55);
      const texts = track.lines.map((line) => line.text);
      const result = await translateSpotifyLyrics({ spotifyId: track.spotifyId, lines: texts, ...getRequestPayload() }, requestController.signal);
      if (token !== operationId) return;
      track.lines = track.lines.map((line, index) => ({ ...line, translation: result.translations[index] }));
      track.translationCached = true;
    }
    persistTrack();
    showPreparedTrack();
    navigateTo("result");
    if (track.streamUrl) {
      status("Ready", "Loaded instantly from the lesson cache.", 100);
      el.result.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    status("Downloading", `Searching YouTube Music for "${track.artist} - ${track.title}"…`, 30);
    el.result.scrollIntoView({ behavior: "smooth", block: "start" });
    startAudioDownload(() => {
      if (currentLayer() === "input") return;
      if (track.streamUrl) {
        showPreparedTrack();
        status("Ready", "Audio downloaded from YouTube Music. Lyrics and translation are ready.", 100);
      } else {
        showPreparedTrack();
        status("Download failed", track.downloadError || "Could not download audio from YouTube Music.", 0, true);
      }
    });
  } catch (error) {
    if (error?.name === "AbortError" || token !== operationId) return;
    status("Failed", error.message, 0, true);
  } finally { setBusy(false); }
};

const startLesson = () => {
  if (!track?.streamUrl) {
    if (track?.downloadError) retryAudioDownload();
    return;
  }
  navigateTo("lesson");
};

const openLesson = () => {
  if (!track?.streamUrl) {
    history.replaceState(historyState(track ? "result" : "input"), "");
    applyLayer(track ? "result" : "input");
    return;
  }
  el.start.hidden = true;
  el.lesson.hidden = false;
  document.body.classList.add("media-player-open");
  if (track.artwork) {
    el.lesson.style.setProperty("--lesson-art", `url("${track.artwork.replaceAll('"', '')}")`);
    el.lessonCover.src = track.artwork;
    el.lessonCover.hidden = false;
  } else {
    el.lessonCover.hidden = true;
  }
  renderLyrics();
  mountAudioPlayer(track.streamUrl);
  cancelAnimationFrame(syncFrame);
  syncFrame = requestAnimationFrame(syncLoop);
};

const cleanupPlayer = () => {
  if (jobPollTimer) { clearTimeout(jobPollTimer); jobPollTimer = null; }
  cleanupAudio();
};

const cleanupAudio = () => {
  if (audioEl) { audioEl.pause(); audioEl.src = ""; audioEl = null; }
};

const retryAudioDownload = () => {
  if (!track) return;
  operationId += 1;
  requestController?.abort();
  requestController = new AbortController();
  status("Downloading", `Searching YouTube Music for "${track.artist} - ${track.title}"…`, 30);
  showPreparedTrack();
  startAudioDownload(() => {
    if (currentLayer() === "input") return;
    showPreparedTrack();
    if (track.streamUrl) status("Ready", "Audio downloaded from YouTube Music. Lyrics and translation are ready.", 100);
    else status("Download failed", track.downloadError || "Could not download audio from YouTube Music.", 0, true);
  });
};

// UI-only teardown for the full-screen player (no history side effects); run when its
// history entry is popped, or invoked directly by goBack() from the in-lesson back button.
const teardownLesson = () => {
  document.body.classList.remove("media-player-open");
  document.body.classList.remove("media-result-open");
  el.lesson.hidden = true;
  el.start.hidden = false;
  audioEl?.pause();
  cancelAnimationFrame(syncFrame);
  syncFrame = 0;
};

// UI-only teardown for the prepared-result screen; returns to the clean input state.
const showInput = () => {
  cleanupAudio();
  document.body.classList.remove("media-player-open");
  cancelAnimationFrame(syncFrame);
  el.lesson.hidden = true;
  el.result.hidden = true; el.status.hidden = true;
  el.view.classList.remove("has-result");
  el.view.classList.remove("is-preparing");
  el.player.replaceChildren(); el.lyrics.replaceChildren();
  // The result card can leave this independent scroller far below the form. Once the card is
  // hidden that position looks like a black/empty screen on Android, so always return to top.
  el.form.closest(".media-scroll")?.scrollTo({ top: 0, behavior: "auto" });
  requestAnimationFrame(() => document.getElementById("learnAddButton")?.focus({ preventScroll: true }));
  refreshLearnLibrary().catch(() => {});
};

function applyLayer(layer) {
  if (layer === "lesson" && track?.streamUrl) return openLesson();
  teardownLesson();
  if (layer === "result" && track) {
    showPreparedTrack();
    el.status.hidden = false;
    return;
  }
  showInput();
}

export const initMedia = () => {
  const hadLearnHistory = history.state?.[HISTORY_VERSION_KEY] === HISTORY_VERSION &&
    LAYERS.has(history.state?.[HISTORY_KEY]);
  if (!hadLearnHistory) history.replaceState(historyState("input"), "");
  window.addEventListener("popstate", (event) => applyLayer(event.state?.[HISTORY_KEY] || "input"));
  el.form?.addEventListener("submit", submit);
  el.start?.addEventListener("click", startLesson);
  el.lessonClose?.addEventListener("click", goBack);
  el.resultBack?.addEventListener("click", goBack);
  el.remove?.addEventListener("click", goBack);
  el.addPlaylist?.addEventListener("click", () => track?.trackId && showPlaylistPicker(track).catch(() => {}));
  initLearnLibrary({
    onOpenTrack: (lesson) => {
      track = lesson;
      persistTrack();
      navigateTo("result");
      showPreparedTrack();
      status("Ready", "Loaded instantly from your library.", 100);
    },
    onPrepareTrack: (item) => {
      el.input.value = item.sourceUrl;
      el.form.requestSubmit();
    }
  });
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (saved?.spotifyId && Array.isArray(saved.lines)) {
      track = saved;
      el.input.value = saved.sourceUrl || "";
      // A fresh tab has only the input entry. Keep it intact and add the restored result
      // above it, otherwise Back has nowhere inside Learn to return to and unloads the app.
      const restoredLayer = hadLearnHistory ? currentLayer() : "result";
      if (!hadLearnHistory) history.pushState(historyState("result"), "");
      applyLayer(restoredLayer);
      if (track.streamUrl) {
        status("Ready", "Audio downloaded from YouTube Music. Lyrics and translation are ready.", 100);
      } else if (track.jobId && !track.downloadError) {
        operationId += 1;
        requestController = new AbortController();
        status("Downloading", "Restoring the audio download…", 30);
        pollMediaJob(track.jobId, track, operationId, () => {
          if (currentLayer() === "input") return;
          showPreparedTrack();
          if (track.streamUrl) status("Ready", "Audio downloaded from YouTube Music. Lyrics and translation are ready.", 100);
          else status("Download failed", track.downloadError || "Could not download audio from YouTube Music.", 0, true);
        });
      } else {
        status("Download failed", track.downloadError || "Audio was not downloaded. Try again.", 0, true);
      }
    } else if (currentLayer() !== "input") {
      history.replaceState(historyState("input"), "");
    }
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }
};
