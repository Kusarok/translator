import { createPersonalRadioStation, deletePersonalRadioStation, getPersonalRadioStations, getRadioStations, updatePersonalRadioStation } from "./api.js";
import Hls from "/assets/vendor/hls.mjs";

const byId = (id) => document.getElementById(id);
const ui = {
  home: byId("radioHome"), rail: byId("radioStationRail"), player: byId("radioPlayer"),
  back: byId("radioPlayerBack"), share: byId("radioPlayerShare"), artwork: byId("radioPlayerArtwork"),
  name: byId("radioPlayerName"), language: byId("radioPlayerLanguage"), status: byId("radioPlayerStatus"),
  play: byId("radioPlayerPlay"), favorite: byId("radioFavorite"), sleep: byId("radioSleep"),
  sleepLabel: byId("radioSleepLabel"), switcher: byId("radioStationSwitcher"), audio: byId("radioAudio"),
  stationTrigger: byId("radioStationTrigger"), stationSheet: byId("radioStationSheet"),
  stationSheetClose: byId("radioStationSheetClose"), stationSheetBackdrop: byId("radioStationSheetBackdrop"),
  mini: byId("radioMiniPlayer"), miniOpen: byId("radioMiniOpen"), miniArtwork: byId("radioMiniArtwork"),
  miniName: byId("radioMiniName"), miniLanguage: byId("radioMiniLanguage"), miniPlay: byId("radioMiniPlay"),
  miniClose: byId("radioMiniClose")
  ,addStation: byId("radioAddStation"), stationForm: byId("radioStationForm"), stationName: byId("radioStationName"),
  stationUrl: byId("radioStationUrl"), stationFormError: byId("radioStationFormError"),
  stationCancel: byId("radioStationCancel"), stationSave: byId("radioStationSave")
};

const FAVORITES_KEY = "translator_radio_favorites";
const LAST_STATION_KEY = "translator_radio_last_station";
const HISTORY_KEY = "translatorRadioOpen";
const PICKER_HISTORY_KEY = "translatorRadioStationPicker";
const sleepOptions = [0, 15, 30, 60];
let stations = [];
let active = null;
let wantsPlayback = false;
let reconnectTimer = 0;
let sleepTimer = 0;
let sleepIndex = 0;
let catalogRetry = 0;
let editingStation = null;
let hls = null;

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

const destroyStream = () => {
  clearTimeout(reconnectTimer);
  reconnectTimer = 0;
  hls?.destroy(); hls = null;
  ui.audio.pause();
  ui.audio.removeAttribute("src");
  ui.audio.load();
};

const cancelReconnect = () => {
  clearTimeout(reconnectTimer);
  reconnectTimer = 0;
};

const scheduleReconnect = (delay = 12_000) => {
  if (!active || !wantsPlayback || reconnectTimer) return;
  setStatus("Connection is slow…", "connecting");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = 0;
    attachStream();
  }, delay);
};

const handlePlayFailure = (error) => {
  if (error?.name === "NotAllowedError") {
    wantsPlayback = false;
    setStatus("Tap play to listen", "ready");
    return;
  }
  scheduleReconnect(2_000);
};

const attachStream = () => {
  if (!active) return;
  destroyStream();
  setStatus(active.live ? "Connecting to live stream…" : "Station is connecting…", "connecting");
  const sourceUrl = new URL(active.streamUrl, location.origin);
  if (!active.personal) sourceUrl.searchParams.set("v", Date.now());
  const source = sourceUrl.href;
  if (active.personal && sourceUrl.pathname.toLowerCase().endsWith(".m3u8") && Hls.isSupported()) {
    hls = new Hls({ enableWorker: false, lowLatencyMode: false, maxBufferLength: 30, backBufferLength: 0 });
    hls.on(Hls.Events.MEDIA_ATTACHED, () => { if (wantsPlayback) ui.audio.play().catch(handlePlayFailure); });
    hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) scheduleReconnect(2_000); });
    hls.loadSource(source); hls.attachMedia(ui.audio); return;
  }
  ui.audio.src = source;
  ui.audio.load();
  if (wantsPlayback) ui.audio.play().catch(handlePlayFailure);
};

const play = async () => {
  if (!active) return;
  wantsPlayback = true;
  document.dispatchEvent(new CustomEvent("translator:radio-play"));
  if (!ui.audio.currentSrc) attachStream();
  try {
    await ui.audio.play();
    setStatus("Live now", "live");
  } catch (error) {
    if (!ui.audio.currentSrc) attachStream();
    else handlePlayFailure(error);
  }
};

const pause = () => {
  wantsPlayback = false;
  ui.audio.pause();
  setStatus("Paused", "paused");
};

const stop = () => {
  wantsPlayback = false;
  destroyStream();
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
  if (changed) destroyStream();
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
    const row = document.createElement("div"); row.className = "radio-station-switcher-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = active?.id === station.id ? "active" : "";
    button.innerHTML = `<img alt=""><span><strong></strong><small></small></span><i></i>`;
    button.querySelector("img").src = station.artwork;
    button.querySelector("img").alt = "";
    button.querySelector("strong").textContent = station.name;
    button.querySelector("small").textContent = station.language;
    button.setAttribute("aria-label", `${active?.id === station.id ? "Current station" : "Play"} ${station.name}`);
    button.addEventListener("click", () => {
      selectStation(station, { open: false });
      closeStationPicker();
    });
    row.append(button);
    if (station.personal) {
      const actions = document.createElement("span"); actions.className = "radio-personal-actions";
      const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Edit"; edit.setAttribute("aria-label", `Edit ${station.name}`);
      edit.addEventListener("click", () => showStationForm(station));
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Delete"; remove.setAttribute("aria-label", `Delete ${station.name}`);
      remove.addEventListener("click", async () => {
        if (!confirm(`Delete ${station.name}?`)) return;
        await deletePersonalRadioStation(station.id);
        if (active?.id === station.id) stop();
        stations = stations.filter((item) => item.id !== station.id); renderCards(); renderSwitcher();
      });
      actions.append(edit, remove); row.append(actions);
    }
    return row;
  }));
}

const showStationForm = (station = null) => {
  if (document.body.dataset.authenticated !== "true") {
    window.dispatchEvent(new CustomEvent("auth:required")); return;
  }
  editingStation = station;
  ui.stationName.value = station?.name || "";
  ui.stationUrl.value = station?.streamUrl || "";
  ui.stationFormError.hidden = true;
  ui.stationForm.hidden = false; ui.addStation.hidden = true;
  ui.stationName.focus({ preventScroll: true });
};

const hideStationForm = () => {
  editingStation = null; ui.stationForm.reset(); ui.stationForm.hidden = true; ui.addStation.hidden = false;
};

const saveStation = async (event) => {
  event.preventDefault(); ui.stationSave.disabled = true; ui.stationFormError.hidden = true;
  try {
    const payload = { name: ui.stationName.value, streamUrl: ui.stationUrl.value };
    const saved = editingStation
      ? await updatePersonalRadioStation(editingStation.id, payload)
      : await createPersonalRadioStation(payload);
    saved.personal = true; saved.language = "Personal"; saved.artwork = "/icon-192.png";
    saved.accent = "#58f1d5"; saved.accentAlt = "#23aeda"; saved.live = true;
    const index = stations.findIndex((item) => item.id === saved.id);
    if (index >= 0) stations[index] = saved; else stations.push(saved);
    hideStationForm(); renderCards(); renderSwitcher();
  } catch (error) {
    ui.stationFormError.textContent = error.message || "Station could not be saved."; ui.stationFormError.hidden = false;
  } finally { ui.stationSave.disabled = false; }
};

const openStationPicker = () => {
  if (!ui.stationSheet?.hidden) return;
  ui.stationSheet.hidden = false;
  ui.stationTrigger?.setAttribute("aria-expanded", "true");
  if (!history.state?.[PICKER_HISTORY_KEY]) {
    history.pushState({ ...(history.state || {}), [HISTORY_KEY]: true, [PICKER_HISTORY_KEY]: true }, "");
  }
  requestAnimationFrame(() => ui.switcher?.querySelector("button.active,button")?.focus({ preventScroll: true }));
};

function closeStationPicker({ fromHistory = false } = {}) {
  if (!ui.stationSheet || ui.stationSheet.hidden) return;
  ui.stationSheet.hidden = true;
  ui.stationTrigger?.setAttribute("aria-expanded", "false");
  if (!fromHistory && history.state?.[PICKER_HISTORY_KEY]) history.back();
  else if (fromHistory) ui.stationTrigger?.focus({ preventScroll: true });
}

const openPlayer = () => {
  ui.player.hidden = false;
  document.body.classList.add("radio-player-open");
  if (!history.state?.[HISTORY_KEY]) history.pushState({ ...(history.state || {}), [HISTORY_KEY]: true }, "");
};

const closePlayer = ({ fromHistory = false } = {}) => {
  closeStationPicker({ fromHistory: true });
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
  ui.stationTrigger?.addEventListener("click", openStationPicker);
  ui.stationSheetClose?.addEventListener("click", () => closeStationPicker());
  ui.stationSheetBackdrop?.addEventListener("click", () => closeStationPicker());
  ui.addStation?.addEventListener("click", () => showStationForm());
  ui.stationCancel?.addEventListener("click", hideStationForm);
  ui.stationForm?.addEventListener("submit", saveStation);
  ui.stationSheet?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); closeStationPicker(); }
  });
  ui.audio.addEventListener("playing", () => { cancelReconnect(); setPlayingUi(true); setStatus("Live now", "live"); });
  ui.audio.addEventListener("timeupdate", cancelReconnect);
  ui.audio.addEventListener("pause", () => setPlayingUi(false));
  ui.audio.addEventListener("waiting", () => wantsPlayback && scheduleReconnect());
  ui.audio.addEventListener("stalled", () => scheduleReconnect());
  ui.audio.addEventListener("error", () => scheduleReconnect(2_000));
  window.addEventListener("popstate", (event) => {
    if (!event.state?.[PICKER_HISTORY_KEY] && !ui.stationSheet?.hidden) closeStationPicker({ fromHistory: true });
    if (!event.state?.[HISTORY_KEY] && !ui.player.hidden) closePlayer({ fromHistory: true });
  });
  document.addEventListener("translator:song-play", () => { if (active && (!ui.audio.paused || !ui.mini.hidden)) stop(); });

  const loadCatalog = async () => {
    try {
      const result = await getRadioStations();
      stations = Array.isArray(result.stations) ? result.stations : [];
      try {
        const personal = await getPersonalRadioStations();
        stations.push(...(personal.stations || []).map((station) => ({ ...station, personal: true, language: "Personal",
          artwork: "/icon-192.png", accent: "#58f1d5", accentAlt: "#23aeda", live: true })));
      } catch { /* Guests still receive the public radio catalog. */ }
      renderCards();
      const remembered = stations.find((station) => station.id === localStorage.getItem(LAST_STATION_KEY));
      if (remembered) { active = remembered; paintActive(); ui.mini.hidden = true; document.body.classList.remove("radio-mini-active"); }
      if (!stations.length) throw new Error("No stations");
    } catch {
      ui.rail.innerHTML = `<div class="radio-unavailable"><strong>Live radio is reconnecting</strong><small>It will be back in a moment.</small></div>`;
      clearTimeout(catalogRetry);
      catalogRetry = setTimeout(loadCatalog, 5_000);
    }
  };
  await loadCatalog();
};
