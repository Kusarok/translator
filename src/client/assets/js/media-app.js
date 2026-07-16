import { t } from "./i18n.js";
import { getSpotifyLyrics, translateSpotifyLyrics, createSearchMediaJob, getMediaJob, importSpotifyPlaylist, saveLearnProgress } from "./api.js";
import { getRequestPayload } from "./byok.js";
import { closeLearnAddSheet, initLearnLibrary, refreshLearnLibrary, showPlaylistPicker } from "./learn-library.js";
import { initLearnSearch } from "./learn-search.js";
import { initArtistHub } from "./artist-hub.js";

const el = Object.fromEntries(Object.entries({
  form: "mediaImportForm", input: "mediaUrl", submit: "mediaSubmit", status: "mediaStatusCard",
  source: "mediaSourceBadge", statusLabel: "mediaStatusLabel", statusText: "mediaStatusText",
  progress: "mediaProgressBar", result: "mediaResult", resultSource: "mediaResultSource",
  title: "mediaResultTitle", meta: "mediaResultMeta", artwork: "mediaArtwork", player: "mediaPlayerWrap",
  disclosure: "mediaDisclosure", original: "mediaOriginal", remove: "mediaRemove", start: "mediaStartLearning",
  view: "mediaView", resultBack: "mediaResultBack",
  addPlaylist: "mediaAddPlaylist",
  mini: "learnMiniPlayer", miniOpen: "learnMiniOpen", miniCover: "learnMiniCover",
  miniCoverFallback: "learnMiniCoverFallback", miniTitle: "learnMiniTitle", miniArtist: "learnMiniArtist",
  miniLyric: "learnMiniLyric", miniPlay: "learnMiniPlay", miniClose: "learnMiniClose", miniProgress: "learnMiniProgress",
  lesson: "mediaLesson", lyrics: "mediaLyrics", lessonClose: "mediaLessonClose",
  lessonTitle: "mediaLessonTitle", lessonArtist: "mediaLessonArtist", lessonCover: "mediaLessonCover",
  lessonNowTab: "lessonNowPlayingTab", lessonLearnTab: "lessonLearnTab", lessonContent: "lessonContent",
  nowPanel: "lessonNowPlayingPanel", nowCover: "mediaNowPlayingCover", nowFallback: "mediaNowPlayingFallback",
  nowTitle: "mediaNowPlayingTitle", nowArtist: "mediaNowPlayingArtist", openLyrics: "lessonOpenLyrics"
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
let playerMode = "now";
let swipeStart = null;
let renderedLyricsTrack = null;
let renderedLyricsLines = null;
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
      repeatLine,
      playerMode
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
  if (el.miniProgress) el.miniProgress.style.width = `${Math.min(1, audioEl.currentTime / dur) * 100}%`;
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
  el.mini?.classList.toggle("is-playing", playing);
  el.miniPlay?.setAttribute("aria-label", playing ? "Pause" : "Play");
};

const showMiniPlayer = (visible = true) => {
  const show = Boolean(visible && audioEl && track);
  el.mini.hidden = !show;
  document.body.classList.toggle("mini-player-active", show);
  if (!show) return;
  el.miniTitle.textContent = track.title || "";
  el.miniArtist.textContent = track.artist || "";
  el.miniArtist.hidden = Boolean(el.miniLyric?.textContent);
  if (track.artwork) {
    el.miniCover.src = track.artwork;
    el.miniCover.hidden = false;
    el.miniCoverFallback.hidden = true;
  } else {
    el.miniCover.hidden = true;
    el.miniCoverFallback.hidden = false;
  }
  setPlaying(!audioEl.paused);
};

const lyricsTrackKey = (target = track) => target?.lyricsId || target?.trackId || target?.spotifyId || null;

const invalidateLyrics = () => {
  activeIndex = -1;
  renderedLyricsTrack = null;
  renderedLyricsLines = null;
  el.lyrics.replaceChildren();
  el.lyrics.scrollTop = 0;
  if (el.miniLyric) el.miniLyric.textContent = "";
  if (el.miniArtist) el.miniArtist.hidden = false;
};

const setPlayerMode = (mode, { focus = false } = {}) => {
  playerMode = mode === "learn" ? "learn" : "now";
  const learning = playerMode === "learn";
  el.lesson.classList.toggle("is-learning-mode", learning);
  el.nowPanel.hidden = learning;
  el.lyrics.hidden = !learning;
  for (const [button, active] of [[el.lessonNowTab, !learning], [el.lessonLearnTab, learning]]) {
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  }
  for (const control of [player.speed, player.repeat].filter(Boolean)) {
    control.tabIndex = learning ? 0 : -1;
    control.setAttribute("aria-hidden", String(!learning));
  }
  if (learning) {
    if (renderedLyricsTrack !== lyricsTrackKey() || renderedLyricsLines !== track?.lines) renderLyrics();
    const time = audioEl?.currentTime || 0;
    activeIndex = -1;
    requestAnimationFrame(() => syncAt(time));
  }
  if (track && audioEl) persistPlaybackSoon();
  if (focus) (learning ? el.lessonLearnTab : el.lessonNowTab).focus({ preventScroll: true });
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
  createSearchMediaJob(query, target.sourceUrl || `track:${target.trackId}`, requestController?.signal)
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
  const publicState = error || ["Failed", "Download failed"].includes(label)
    ? { source: "Playback", label: "Couldn't play", message: message || "Try this song again." }
    : label === "Ready"
      ? { source: "Online music", label: "Ready to play", message: "Your song is ready." }
      : label === "Importing"
        ? { source: "Your music", label: "Adding playlist", message: "Adding songs to your library…" }
        : { source: "Online music", label: "Getting song ready", message: "You can keep browsing while we prepare it." };
  el.status.hidden = false;
  el.source.textContent = publicState.source;
  el.statusLabel.textContent = publicState.label;
  el.statusText.textContent = publicState.message;
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
  el.resultSource.textContent = ready ? "Ready to play" : "Getting song ready";
  el.title.textContent = track.title;
  el.meta.textContent = `${track.artist}${track.album ? ` · ${track.album}` : ""}`;
  el.lessonTitle.textContent = track.title;
  el.lessonArtist.textContent = track.artist;
  el.nowTitle.textContent = track.title;
  el.nowArtist.textContent = track.artist;
  el.original.href = track.sourceUrl;
  el.original.hidden = !track.sourceUrl;
  if (track.artwork) {
    el.artwork.src = track.artwork; el.artwork.hidden = false;
    el.nowCover.src = track.artwork; el.nowCover.hidden = false; el.nowFallback.hidden = true;
    el.result.style.setProperty("--result-art", `url("${track.artwork.replaceAll('"', '')}")`);
  } else {
    el.artwork.hidden = true;
    el.nowCover.hidden = true; el.nowFallback.hidden = false;
    el.result.style.removeProperty("--result-art");
  }
  el.lesson.hidden = true;
  el.start.hidden = false;
  const failed = Boolean(track.downloadError);
  el.start.disabled = !ready && !failed;
  el.start.textContent = ready ? "Play song" : failed ? "Try again" : "Getting song ready…";
  el.start.classList.toggle("is-waiting", !ready && !failed);
  el.result.hidden = false;
  el.view.classList.add("has-result");
  el.view.classList.remove("is-preparing");
  document.body.classList.add("media-result-open");
};

const renderLyrics = () => {
  if (!track || !Array.isArray(track.lines)) {
    invalidateLyrics();
    return;
  }
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
  renderedLyricsTrack = lyricsTrackKey();
  renderedLyricsLines = track.lines;
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
  if (el.miniLyric) {
    el.miniLyric.textContent = activeIndex >= 0 ? (track.lines[activeIndex]?.text || "") : "";
    el.miniArtist.hidden = Boolean(el.miniLyric.textContent);
  }
  if (row && playerMode === "learn") {
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

const beginPreparation = () => {
  el.view.classList.add("is-preparing");
  playerMode = "now";
  operationId += 1;
  const token = operationId;
  requestController?.abort();
  requestController = new AbortController();
  cleanupPlayer();
  track = null; activeIndex = -1;
  cancelAnimationFrame(syncFrame);
  el.player.replaceChildren();
  invalidateLyrics();
  el.result.hidden = true;
  setBusy(true);
  return token;
};

const prepareTranslation = async (target, token) => {
  if (target.translationCached || !target.lines?.length) return;
  try {
    const result = await translateSpotifyLyrics({
      spotifyId: target.spotifyId,
      trackId: target.trackId,
      lines: target.lines.map((line) => line.text),
      ...getRequestPayload()
    }, requestController.signal);
    if (token !== operationId || track !== target) return;
    target.lines = target.lines.map((line, index) => ({ ...line, translation: result.translations[index] || "" }));
    target.translationCached = true;
    persistTrack();
    if (!el.lesson.hidden && playerMode === "learn") {
      const currentTime = audioEl?.currentTime || 0;
      activeIndex = -1;
      renderLyrics();
      syncAt(currentTime);
    }
  } catch (error) {
    if (error?.name !== "AbortError" && token === operationId && track === target) {
      target.translationError = "Translation will be available when you try again.";
      persistTrack();
    }
  }
};

const completePreparedTrack = async (prepared, token) => {
  if (token !== operationId) return;
  track = prepared;
  persistTrack();
  navigateTo("result");
  showPreparedTrack();
  void prepareTranslation(track, token);
  if (track.streamUrl) {
    status("Ready", "Ready to play.", 100);
    openAndPlay();
    return;
  }
  status("Downloading", "Getting your song ready…", 30);
  el.result.scrollIntoView({ behavior: "smooth", block: "start" });
  startAudioDownload(() => {
    if (currentLayer() === "input") return;
    if (track.streamUrl) {
      showPreparedTrack();
      status("Ready", "Ready to play.", 100);
      openAndPlay();
    } else {
      showPreparedTrack();
      status("Download failed", track.downloadError || "This song could not be played.", 0, true);
    }
  });
};

const submit = async (event) => {
  event.preventDefault();
  if (/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\//i.test(el.input.value)) {
    closeLearnAddSheet(false);
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
  closeLearnAddSheet(false);
  const token = beginPreparation();
  try {
    status("Checking", "Reading the Spotify track and finding an exact lyrics match…", 22);
    const prepared = await getSpotifyLyrics(el.input.value, requestController.signal);
    await completePreparedTrack(prepared, token);
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
  openAndPlay();
};

const openLesson = () => {
  if (!track?.streamUrl) {
    history.replaceState(historyState(track ? "result" : "input"), "");
    applyLayer(track ? "result" : "input");
    return;
  }
  el.start.hidden = true;
  el.lesson.hidden = false;
  showMiniPlayer(false);
  document.body.classList.add("media-player-open");
  if (track.artwork) {
    el.lesson.style.setProperty("--lesson-art", `url("${track.artwork.replaceAll('"', '')}")`);
    el.lessonCover.src = track.artwork;
    el.lessonCover.hidden = false;
  } else {
    el.lessonCover.hidden = true;
  }
  if (!audioEl) mountAudioPlayer(track.streamUrl);
  setPlayerMode(playerMode);
  cancelAnimationFrame(syncFrame);
  if (audioEl && !audioEl.paused) syncFrame = requestAnimationFrame(syncLoop);
};

const openAndPlay = () => {
  if (!track?.streamUrl) return;
  // The result screen is only a preparation/error state. Once audio is ready,
  // replace it with the player so Android Back returns to the page where the
  // user chose the song instead of forcing an unnecessary intermediate stop.
  if (currentLayer() !== "lesson") {
    history.replaceState(historyState("lesson"), "");
    applyLayer("lesson");
  }
  else openLesson();
  requestAnimationFrame(() => audioEl?.play().catch(() => {}));
};

const cleanupPlayer = () => {
  if (jobPollTimer) { clearTimeout(jobPollTimer); jobPollTimer = null; }
  cleanupAudio();
};

const cleanupAudio = () => {
  if (audioEl) { audioEl.pause(); audioEl.src = ""; audioEl = null; }
  showMiniPlayer(false);
  if (el.miniProgress) el.miniProgress.style.width = "0%";
};

const retryAudioDownload = () => {
  if (!track) return;
  operationId += 1;
  requestController?.abort();
  requestController = new AbortController();
  status("Downloading", "Getting your song ready…", 30);
  showPreparedTrack();
  startAudioDownload(() => {
    if (currentLayer() === "input") return;
    showPreparedTrack();
    if (track.streamUrl) {
      status("Ready", "Ready to play.", 100);
      openAndPlay();
    } else status("Download failed", track.downloadError || "This song could not be played.", 0, true);
  });
};

// UI-only teardown for the full-screen player (no history side effects); run when its
// history entry is popped, or invoked directly by goBack() from the in-lesson back button.
const teardownLesson = () => {
  document.body.classList.remove("media-player-open");
  document.body.classList.remove("media-result-open");
  el.lesson.hidden = true;
  el.start.hidden = false;
  cancelAnimationFrame(syncFrame);
  syncFrame = 0;
  showMiniPlayer(true);
};

// UI-only teardown for the prepared-result screen; returns to the clean input state.
const showInput = () => {
  document.body.classList.remove("media-player-open");
  cancelAnimationFrame(syncFrame);
  el.lesson.hidden = true;
  el.result.hidden = true; el.status.hidden = true;
  el.view.classList.remove("has-result");
  el.view.classList.remove("is-preparing");
  if (!audioEl) { el.player.replaceChildren(); el.lyrics.replaceChildren(); }
  showMiniPlayer(Boolean(audioEl));
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
  window.addEventListener("popstate", (event) => {
    const layer = event.state?.[HISTORY_KEY] || "input";
    const playerSurfaceOpen = !el.lesson.hidden || !el.result.hidden || el.view.classList.contains("has-result");
    // Destination changes (Home/Search/Your Music) share the same URL and also
    // emit popstate. They must not reset scroll, focus, or the active mini player.
    if (layer === "input" && !playerSurfaceOpen) return;
    applyLayer(layer);
  });
  el.form?.addEventListener("submit", submit);
  el.start?.addEventListener("click", startLesson);
  el.lessonClose?.addEventListener("click", goBack);
  el.resultBack?.addEventListener("click", goBack);
  el.remove?.addEventListener("click", goBack);
  el.addPlaylist?.addEventListener("click", () => track?.trackId && showPlaylistPicker(track).catch(() => {}));
  el.miniOpen?.addEventListener("click", () => {
    if (!track?.streamUrl) return;
    if (currentLayer() === "lesson") openLesson();
    else navigateTo("lesson");
  });
  el.miniPlay?.addEventListener("click", () => {
    if (!audioEl) return;
    if (audioEl.paused) audioEl.play().catch(() => {}); else audioEl.pause();
  });
  el.miniClose?.addEventListener("click", () => {
    persistLearningProgress(true);
    cleanupAudio();
    el.player.replaceChildren();
    invalidateLyrics();
  });
  el.lessonNowTab?.addEventListener("click", () => setPlayerMode("now"));
  el.lessonLearnTab?.addEventListener("click", () => setPlayerMode("learn"));
  for (const tab of [el.lessonNowTab, el.lessonLearnTab]) tab?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault(); setPlayerMode(event.key === "ArrowRight" ? "learn" : "now", { focus: true });
  });
  el.openLyrics?.addEventListener("click", () => setPlayerMode("learn", { focus: true }));
  el.lessonContent?.addEventListener("touchstart", (event) => {
    const touch = event.touches[0];
    swipeStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }, { passive: true });
  el.lessonContent?.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    if (!swipeStart || !touch) return;
    const dx = touch.clientX - swipeStart.x;
    const dy = touch.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    setPlayerMode(dx < 0 ? "learn" : "now");
  }, { passive: true });
  initLearnLibrary({
    onOpenTrack: async (lesson) => {
      if (track?.trackId !== lesson.trackId) playerMode = "now";
      if (track?.trackId !== lesson.trackId) {
        cleanupAudio();
        el.player.replaceChildren();
        invalidateLyrics();
      }
      if (!lesson.translationCached) {
        const token = beginPreparation();
        try { await completePreparedTrack(lesson, token); }
        catch (error) { if (token === operationId) status("Failed", error.message, 0, true); }
        finally { setBusy(false); }
        return;
      }
      track = lesson;
      persistTrack();
      navigateTo("result");
      showPreparedTrack();
      status("Ready", "Ready to play.", 100);
      openAndPlay();
    },
    onPrepareTrack: (item) => {
      el.input.value = item.sourceUrl;
      el.form.requestSubmit();
    }
  });
  initLearnSearch({
    onPrepare: async (lesson) => {
      const token = beginPreparation();
      try { await completePreparedTrack(lesson, token); }
      catch (error) { if (token === operationId) status("Failed", error.message, 0, true); }
      finally { setBusy(false); }
    }
  });
  initArtistHub({
    onPrepare: async (lesson) => {
      const token = beginPreparation();
      try { await completePreparedTrack(lesson, token); }
      catch (error) { if (token === operationId) status("Failed", error.message, 0, true); }
      finally { setBusy(false); }
    }
  });
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (saved?.spotifyId && Array.isArray(saved.lines)) {
      track = saved;
      playerMode = saved.playback?.playerMode === "learn" ? "learn" : "now";
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
