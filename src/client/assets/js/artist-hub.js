import { createLearnArtist, discoverLearnArtists, getLearnArtist, prepareLearnArtistTrack } from "./api.js";

const $ = (id) => document.getElementById(id);
const el = {
  page: $("learnArtistPage"), back: $("learnArtistBack"), hero: $("learnArtistHero"), progress: $("learnArtistProgress"),
  progressText: $("learnArtistProgressText"), count: $("learnArtistCount"), tracks: $("learnArtistTracks"),
  empty: $("learnArtistEmpty"), library: $("learnLibrary"), playlist: $("learnPlaylistPage"), search: $("learnSearchPage"),
  scroll: document.querySelector("#mediaView .media-scroll")
};

let timer = 0;
let controller = null;
let previousPage = null;
let prepareHandler = null;

const announceError = (message) => {
  let toast = document.querySelector(".learn-toast");
  if (!toast) {
    toast = document.createElement("div"); toast.className = "learn-toast";
    toast.setAttribute("role", "alert"); document.body.append(toast);
  }
  toast.textContent = message || "The artist could not be opened."; toast.classList.add("is-visible");
  clearTimeout(announceError.timer); announceError.timer = setTimeout(() => toast.classList.remove("is-visible"), 3500);
};

const stopPolling = () => { clearTimeout(timer); controller?.abort(); controller = null; };

const trackRow = (track) => {
  const row = document.createElement("button"); row.type = "button"; row.className = "learn-track-row";
  if (track.artwork) { const img = document.createElement("img"); img.src = track.artwork; img.alt = ""; img.loading = "lazy"; row.append(img); }
  else { const art = document.createElement("span"); art.className = "learn-track-art-fallback"; art.textContent = "♪"; row.append(art); }
  const copy = document.createElement("span"); copy.className = "learn-track-copy";
  const title = document.createElement("strong"); title.textContent = track.title;
  const meta = document.createElement("small"); meta.textContent = track.album || "Lyrics ready";
  const state = document.createElement("span"); state.className = "learn-track-state"; state.textContent = "▶";
  copy.append(title, meta); row.append(copy, state);
  row.setAttribute("aria-label", `Play ${track.title}`);
  row.addEventListener("click", async () => {
    if (row.dataset.busy === "true") return;
    row.dataset.busy = "true"; row.setAttribute("aria-busy", "true"); state.textContent = "…";
    try { prepareHandler?.(await prepareLearnArtistTrack(track.id)); }
    catch (error) { announceError(error.message); }
    finally { row.dataset.busy = "false"; row.setAttribute("aria-busy", "false"); state.textContent = "▶"; }
  });
  return row;
};

const render = (artist) => {
  const avatar = document.createElement("div"); avatar.className = "learn-artist-avatar"; avatar.textContent = artist.name.slice(0, 1).toUpperCase() || "♪";
  const title = document.createElement("h1"); title.textContent = artist.name;
  const details = document.createElement("p"); details.textContent = [artist.type, artist.country, artist.disambiguation].filter(Boolean).join(" · ") || "Artist catalog";
  el.hero.replaceChildren(avatar, title, details);
  el.tracks.replaceChildren(...artist.tracks.map(trackRow));
  el.count.textContent = `${artist.tracks.length} songs`;
  const active = artist.status === "queued" || artist.status === "scanning";
  el.page.setAttribute("aria-busy", active ? "true" : "false");
  el.progress.hidden = !active;
  el.progressText.textContent = active
    ? "Adding playable songs in the background. You can keep listening."
    : artist.status === "failed" ? artist.error || "Some songs could not be added. Try again later." : "All available songs are ready";
  el.empty.hidden = Boolean(artist.tracks.length) || active;
  return active;
};

const poll = async (id, signal) => {
  try {
    const artist = await getLearnArtist(id, signal);
    if (render(artist)) timer = setTimeout(() => poll(id, signal), 1800);
  } catch (error) {
    if (error.name !== "AbortError") {
      el.page.setAttribute("aria-busy", "false"); el.progress.hidden = false; el.progressText.textContent = error.message;
    }
  }
};

const showArtist = async (artist) => {
  stopPolling(); controller = new AbortController();
  previousPage = !el.search?.hidden ? el.search : !el.playlist?.hidden ? el.playlist : el.library;
  previousPage.hidden = true; el.page.hidden = false;
  el.page.setAttribute("aria-busy", "true");
  el.scroll?.scrollTo({ top: 0, behavior: "auto" });
  if (!history.state?.learnArtist) history.pushState({ ...(history.state || {}), learnArtist: true }, "");
  render(artist); await poll(artist.id, controller.signal);
};

const chooseArtist = (artists) => new Promise((resolve) => {
  const backdrop = document.createElement("div"); backdrop.className = "learn-sheet-backdrop";
  const sheet = document.createElement("div"); sheet.className = "learn-sheet";
  sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.tabIndex = -1;
  const handle = document.createElement("div"); handle.className = "learn-sheet-handle";
  const heading = document.createElement("div"); heading.className = "learn-sheet-title";
  const copy = document.createElement("div"); copy.innerHTML = "<span>Add artist</span><h2>Choose the artist</h2>";
  const close = document.createElement("button"); close.type = "button"; close.textContent = "×"; close.setAttribute("aria-label", "Close");
  const token = `artist-picker-${Date.now()}`;
  let selected = null; let resolved = false;
  const finish = () => {
    if (resolved) return; resolved = true; window.removeEventListener("popstate", finish);
    backdrop.remove(); resolve(selected);
  };
  const dismiss = (value = null) => {
    selected = value;
    if (history.state?.learnArtistPicker === token) history.back(); else finish();
  };
  close.addEventListener("click", () => dismiss()); backdrop.addEventListener("click", (event) => { if (event.target === backdrop) dismiss(); });
  backdrop.addEventListener("keydown", (event) => { if (event.key === "Escape") dismiss(); });
  heading.append(copy, close); sheet.append(handle, heading);
  const list = document.createElement("div"); list.className = "learn-song-picker";
  for (const artist of artists) {
    const button = document.createElement("button"); button.type = "button"; button.className = "learn-artist-choice";
    const avatar = document.createElement("span"); avatar.textContent = artist.name.slice(0, 1).toUpperCase();
    const text = document.createElement("span");
    const name = document.createElement("strong"); name.textContent = artist.name;
    const meta = document.createElement("small"); meta.textContent = [artist.type, artist.country, artist.disambiguation].filter(Boolean).join(" · ") || "Artist";
    const arrow = document.createElement("span"); arrow.textContent = "›"; text.append(name, meta); button.append(avatar, text, arrow);
    button.addEventListener("click", () => dismiss(artist)); list.append(button);
  }
  sheet.append(list); backdrop.append(sheet); document.body.append(backdrop);
  history.pushState({ ...(history.state || {}), learnArtistPicker: token }, "");
  window.addEventListener("popstate", finish);
  requestAnimationFrame(() => sheet.focus());
});

export const openArtistHub = async (name) => {
  const query = String(name || "").trim(); if (!query) return;
  const { artists } = await discoverLearnArtists(query);
  if (!artists.length) throw new Error("No matching artist was found.");
  const selected = await chooseArtist(artists); if (!selected) return;
  const artist = await createLearnArtist(selected);
  window.dispatchEvent(new CustomEvent("learn:refresh-library"));
  await showArtist(artist);
};

export const openSavedArtist = async (id) => showArtist(await getLearnArtist(id));

const close = (useHistory = true) => {
  if (useHistory && history.state?.learnArtist) { history.back(); return; }
  stopPolling(); el.page.setAttribute("aria-busy", "false"); el.page.hidden = true; (previousPage || el.library).hidden = false; previousPage = null;
  el.scroll?.scrollTo({ top: 0, behavior: "auto" });
};

export const initArtistHub = ({ onPrepare } = {}) => {
  prepareHandler = onPrepare;
  el.back?.addEventListener("click", close);
  window.addEventListener("learn:open-artist", async (event) => {
    try { await openArtistHub(event.detail?.name); }
    catch (error) { announceError(error.message); }
    finally { event.detail?.onDone?.(); }
  });
  window.addEventListener("learn:open-saved-artist", (event) => openSavedArtist(event.detail?.id).catch((error) => announceError(error.message)));
  window.addEventListener("popstate", (event) => { if (!event.state?.learnArtist && !el.page.hidden) close(false); });
};
