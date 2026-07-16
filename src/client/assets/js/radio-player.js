import { getRadioStations } from "./api.js";

const byId = (id) => document.getElementById(id);
const ui = {
  home: byId("radioHome"), rail: byId("radioStationRail"), player: byId("radioPlayer"),
  back: byId("radioPlayerBack"), share: byId("radioPlayerShare"), artwork: byId("radioPlayerArtwork"),
  name: byId("radioPlayerName"), language: byId("radioPlayerLanguage"), status: byId("radioPlayerStatus"),
  play: byId("radioPlayerPlay"), favorite: byId("radioFavorite"), sleep: byId("radioSleep"),
  sleepLabel: byId("radioSleepLabel"), switcher: byId("radioStationSwitcher"), audio: byId("radioAudio"),
  mini: byId("radioMiniPlayer"), miniOpen: byId("radioMiniOpen"), miniArtwork: byId("radioMiniArtwork"),
  miniName: byId("radioMiniName"), miniLanguage: byId("radioMiniLanguage"), miniPlay: byId("radioMiniPlay"),
  miniClose: byId("radioMiniClose")
};

const FAVORITES_KEY = "translator_radio_favorites";
const LAST_STATION_KEY = "translator_radio_last_station";
const HISTORY_KEY = "translatorRadioOpen";
const sleepOptions = [0, 15, 30, 60];
let stations = [];
let active = null;
let hls = null;
let wantsPlayback = false;
let reconnectTimer = 0;
let sleepTimer = 0;
let sleepIndex = 0;

const favorites = () => {
  try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]")); } catch { return new Set(); }
};

const saveFavorites = (items) => localStorage.setItem(FAVORITES_KEY, JSON.stringify([...items]));

const setStatus = (message, kind = "") => {
  ui.status.textContent = message;
  ui.player.dataset.status = kind;
};

const setPlayingUi = (playing) => {
  ui.player.classList.toggle("is-playing", playing);
  ui.mini.classList.toggle("is-playing", playing);
  document.body.classList.toggle("radio-is-playing", playing);
  ui.play.setAttribute("aria-label", playing ? "Pause live radio" : "Play live radio");
  ui.miniPlay.setAttribute("aria-label", playing ? "Pause live radio" : "Play live radio");
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused";
};

const updateMediaSession = () => {
  if (!("mediaSession" in navigator) || !active) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: active.name,
    artist: `${active.language} · Live Radio`,
    album: "24/7 Music",
    artwork: [{ src: new URL(active.artwork, location.origin).href, sizes: "800x800" }]
  });
  const actions = {
    play: () => play(), pause: () => pause(), stop: () => stop(),
    previoustrack: () => switchRelative(-1), nexttrack: () => switchRelative(1)
  };
  for (const [action, handler] of Object.entries(actions)) {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
  }
};

const destroyHls = () => {
  clearTimeout(reconnectTimer);
  reconnectTimer = 0;
  hls?.destroy();
  hls = null;
  ui.audio.pause();
  ui.audio.removeAttribute("src");
  ui.audio.load();
};

const reconnect = () => {
  if (!active || !wantsPlayback || reconnectTimer) return;
  setStatus("Reconnecting…", "connecting");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = 0;
    attachStream();
  }, 2500);
};

const attachStream = () => {
  if (!active) return;
  destroyHls();
  setStatus(active.live ? "Connecting to live stream…" : "Station is connecting…", "connecting");
  const source = `${active.streamUrl}?v=${Date.now()}`;
  if (ui.audio.canPlayType("application/vnd.apple.mpegurl")) {
    ui.audio.src = source;
    ui.audio.load();
    if (wantsPlayback) ui.audio.play().catch(reconnect);
    return;
  }
  if (window.Hls?.isSupported()) {
    hls = new window.Hls({
      enableWorker: true,
      lowLatencyMode: false,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 8,
      backBufferLength: 0,
      maxBufferLength: 30,
      manifestLoadingMaxRetry: 8,
      fragLoadingMaxRetry: 8
    });
    hls.loadSource(source);
    hls.attachMedia(ui.audio);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      setStatus("Live now", "live");
      if (wantsPlayback) ui.audio.play().catch(() => setStatus("Tap play to listen", "ready"));
    });
    hls.on(window.Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) hls?.startLoad();
      else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) hls?.recoverMediaError();
      else reconnect();
    });
    return;
  }
  setStatus("Live radio is not supported by this browser.", "error");
};

const play = async () => {
  if (!active) return;
  wantsPlayback = true;
  document.dispatchEvent(new CustomEvent("translator:radio-play"));
  if (!ui.audio.currentSrc && !hls) attachStream();
  try {
    await ui.audio.play();
    setStatus("Live now", "live");
  } catch {
    if (!hls && !ui.audio.currentSrc) attachStream();
  }
};

const pause = () => {
  wantsPlayback = false;
  ui.audio.pause();
  setStatus("Paused", "paused");
};

const stop = () => {
  wantsPlayback = false;
  destroyHls();
  setPlayingUi(false);
  ui.mini.hidden = true;
  document.body.classList.remove("radio-mini-active");
  if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
};

const paintFavorite = () => {
  const selected = Boolean(active && favorites().has(active.id));
  ui.favorite.classList.toggle("is-active", selected);
  ui.favorite.setAttribute("aria-label", selected ? "Remove from favorites" : "Add to favorites");
  ui.favorite.querySelector("span").textContent = selected ? "Saved" : "Favorite";
};

const paintActive = () => {
  if (!active) return;
  const styleTarget = ui.player;
  styleTarget.style.setProperty("--radio-accent", active.accent);
  styleTarget.style.setProperty("--radio-accent-alt", active.accentAlt);
  ui.artwork.src = active.artwork;
  ui.artwork.alt = `${active.name} live radio artwork`;
  ui.name.textContent = active.name;
  ui.language.textContent = `${active.language.toUpperCase()} · 24/7`;
  ui.miniArtwork.src = active.artwork;
  ui.miniName.textContent = active.name;
  ui.miniLanguage.textContent = active.language;
  ui.mini.hidden = false;
  document.body.classList.add("radio-mini-active");
  localStorage.setItem(LAST_STATION_KEY, active.id);
  paintFavorite();
  renderCards();
  renderSwitcher();
  updateMediaSession();
};

const selectStation = (station, { autoplay = true, open = true } = {}) => {
  const changed = active?.id !== station.id;
  active = station;
  if (changed) destroyHls();
  paintActive();
  if (open) openPlayer();
  if (autoplay) play();
};

const stationCard = (station) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "radio-station-card";
  button.classList.toggle("is-active", active?.id === station.id);
  button.style.setProperty("--card-accent", station.accent);
  button.style.setProperty("--card-accent-alt", station.accentAlt);
  button.setAttribute("aria-label", `Play ${station.name}`);
  button.innerHTML = `<img alt=""><span class="radio-card-shade"></span><span class="radio-card-live"><i></i>${station.live ? "LIVE" : "CONNECTING"}</span><span class="radio-card-copy"><strong></strong><small></small></span><span class="radio-card-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><span class="radio-card-bars"><i></i><i></i><i></i></span></span>`;
  button.querySelector("img").src = station.artwork;
  button.querySelector("img").alt = "";
  button.querySelector("strong").textContent = station.name;
  button.querySelector("small").textContent = `${station.language} music · 24/7`;
  button.addEventListener("click", () => selectStation(station));
  return button;
};

function renderCards() {
  if (!stations.length) return;
  ui.rail.replaceChildren(...stations.map(stationCard));
}

function renderSwitcher() {
  ui.switcher.replaceChildren(...stations.map((station) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = active?.id === station.id ? "active" : "";
    button.innerHTML = `<img alt=""><span><strong></strong><small></small></span><i></i>`;
    button.querySelector("img").src = station.artwork;
    button.querySelector("strong").textContent = station.name;
    button.querySelector("small").textContent = station.language;
    button.addEventListener("click", () => selectStation(station, { open: false }));
    return button;
  }));
}

const openPlayer = () => {
  ui.player.hidden = false;
  document.body.classList.add("radio-player-open");
  if (!history.state?.[HISTORY_KEY]) history.pushState({ ...(history.state || {}), [HISTORY_KEY]: true }, "");
};

const closePlayer = ({ fromHistory = false } = {}) => {
  ui.player.hidden = true;
  document.body.classList.remove("radio-player-open");
  if (!fromHistory && history.state?.[HISTORY_KEY]) history.back();
};

const switchRelative = (direction) => {
  if (!stations.length) return;
  const index = Math.max(0, stations.findIndex((station) => station.id === active?.id));
  selectStation(stations[(index + direction + stations.length) % stations.length], { open: false });
};

const toggleFavorite = () => {
  if (!active) return;
  const selected = favorites();
  if (selected.has(active.id)) selected.delete(active.id); else selected.add(active.id);
  saveFavorites(selected);
  paintFavorite();
};

const setSleepTimer = () => {
  clearTimeout(sleepTimer);
  sleepIndex = (sleepIndex + 1) % sleepOptions.length;
  const minutes = sleepOptions[sleepIndex];
  ui.sleep.classList.toggle("is-active", minutes > 0);
  ui.sleepLabel.textContent = minutes ? `${minutes} min` : "Sleep";
  if (minutes) sleepTimer = setTimeout(() => { pause(); sleepIndex = 0; ui.sleepLabel.textContent = "Sleep"; ui.sleep.classList.remove("is-active"); }, minutes * 60_000);
};

const share = async () => {
  if (!active) return;
  const data = { title: active.name, text: `Listen to ${active.name} live radio`, url: location.href };
  try { if (navigator.share) await navigator.share(data); else await navigator.clipboard.writeText(location.href); } catch {}
};

export const initRadio = async () => {
  if (!ui.home || !ui.audio) return;
  ui.back.addEventListener("click", () => closePlayer());
  ui.play.addEventListener("click", () => ui.audio.paused ? play() : pause());
  ui.miniPlay.addEventListener("click", () => ui.audio.paused ? play() : pause());
  ui.miniOpen.addEventListener("click", openPlayer);
  ui.miniClose.addEventListener("click", stop);
  ui.favorite.addEventListener("click", toggleFavorite);
  ui.sleep.addEventListener("click", setSleepTimer);
  ui.share.addEventListener("click", share);
  ui.audio.addEventListener("playing", () => { setPlayingUi(true); setStatus("Live now", "live"); });
  ui.audio.addEventListener("pause", () => setPlayingUi(false));
  ui.audio.addEventListener("waiting", () => wantsPlayback && setStatus("Connecting…", "connecting"));
  ui.audio.addEventListener("stalled", reconnect);
  ui.audio.addEventListener("error", reconnect);
  window.addEventListener("popstate", (event) => { if (!event.state?.[HISTORY_KEY] && !ui.player.hidden) closePlayer({ fromHistory: true }); });
  document.addEventListener("translator:song-play", () => { if (active && (!ui.audio.paused || !ui.mini.hidden)) stop(); });

  try {
    const result = await getRadioStations();
    stations = Array.isArray(result.stations) ? result.stations : [];
    renderCards();
    const remembered = stations.find((station) => station.id === localStorage.getItem(LAST_STATION_KEY));
    if (remembered) { active = remembered; paintActive(); ui.mini.hidden = true; document.body.classList.remove("radio-mini-active"); }
    if (!stations.length) throw new Error("No stations");
  } catch {
    ui.rail.innerHTML = `<div class="radio-unavailable"><strong>Live radio is reconnecting</strong><small>It will be back in a moment.</small></div>`;
  }
};
