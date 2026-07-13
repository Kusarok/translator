import { createLearnSearch, getLearnSearch, prepareLearnSearchResult } from "./api.js";

const $ = (id) => document.getElementById(id);
const el = {
  library: $("learnLibrary"), page: $("learnSearchPage"), form: $("learnSearchForm"), input: $("learnSearchInput"),
  pageForm: $("learnSearchPageForm"), pageInput: $("learnSearchPageInput"), back: $("learnSearchBack"),
  clear: $("learnSearchClear"), summary: $("learnSearchSummary"), loading: $("learnSearchLoading"),
  artist: $("learnSearchArtist"),
  stage: $("learnSearchStage"), results: $("learnSearchResults"), empty: $("learnSearchEmpty"),
  scroll: document.querySelector("#mediaView .media-scroll")
};

let controller = null;
let pollTimer = 0;
let debounceTimer = 0;
let prepareHandler = null;
const LIBRARY_TAB_HISTORY_KEY = "learnLibraryTab";

const announce = (message) => {
  let toast = document.querySelector(".learn-toast");
  if (!toast) {
    toast = document.createElement("div"); toast.className = "learn-toast";
    toast.setAttribute("role", "alert"); document.body.append(toast);
  }
  toast.textContent = message || "This song could not be played."; toast.classList.add("is-visible");
  clearTimeout(announce.timer); announce.timer = setTimeout(() => toast.classList.remove("is-visible"), 3500);
};

const stop = () => {
  clearTimeout(pollTimer); clearTimeout(debounceTimer);
  controller?.abort(); controller = null;
};

const revealSearch = (useHistory = true) => {
  if (useHistory && !history.state?.learnSearch) {
    history.pushState({ ...(history.state || {}), learnSearch: true }, "");
  }
  el.library.hidden = true;
  el.page.hidden = false;
  el.page.setAttribute("aria-busy", "false");
  el.scroll?.scrollTo({ top: 0, behavior: "auto" });
  window.dispatchEvent(new CustomEvent("learn:search-opened"));
};

const openSearchPage = () => {
  stop();
  window.dispatchEvent(new CustomEvent("learn:base-destination", { detail: { destination: "search" } }));
  revealSearch(true);
  el.loading.hidden = true;
  el.empty.hidden = true;
  if (!el.results.children.length) el.summary.textContent = "Search by song, artist, or a lyric line.";
  requestAnimationFrame(() => el.pageInput.focus({ preventScroll: true }));
};

const resultCard = (result) => {
  const card = document.createElement("article"); card.className = "learn-search-result";
  if (result.artwork) { const img = document.createElement("img"); img.src = result.artwork; img.alt = ""; img.loading = "lazy"; card.append(img); }
  else { const art = document.createElement("span"); art.className = "learn-search-result-art"; art.textContent = "♪"; card.append(art); }
  const copy = document.createElement("span"); copy.className = "learn-search-result-copy";
  const title = document.createElement("strong"); title.textContent = result.title;
  const meta = document.createElement("small");
  const artist = document.createElement("button"); artist.type = "button"; artist.className = "learn-search-artist-link";
  artist.textContent = `${result.artist}  ›`;
  artist.addEventListener("click", () => {
    const label = artist.textContent; artist.disabled = true; artist.textContent = "Opening artist…";
    window.dispatchEvent(new CustomEvent("learn:open-artist", { detail: {
      name: result.artist, onDone: () => { artist.disabled = false; artist.textContent = label; }
    }}));
  });
  meta.append(artist, document.createTextNode(result.album ? ` · ${result.album}` : ""));
  copy.append(title, meta);
  if (result.matchedLine) { const line = document.createElement("span"); line.className = "learn-search-match"; line.textContent = `“${result.matchedLine}”`; copy.append(line); }
  const badges = document.createElement("span"); badges.className = "learn-search-badges";
  for (const label of ["Lyrics ready", result.cached ? "Ready to play" : "Available"]) {
    const badge = document.createElement("span"); badge.textContent = label; badges.append(badge);
  }
  copy.append(badges);
  const play = document.createElement("button"); play.type = "button"; play.className = "learn-search-result-play"; play.setAttribute("aria-label", `Play ${result.title}`); play.textContent = "▶";
  card.append(copy, play);
  card.tabIndex = 0; card.setAttribute("role", "button"); card.setAttribute("aria-label", `Play ${result.title} by ${result.artist}`);
  const activate = async () => {
    if (card.dataset.busy === "true") return;
    card.dataset.busy = "true"; card.setAttribute("aria-busy", "true");
    play.disabled = true; play.textContent = "…";
    try { prepareHandler?.(await prepareLearnSearchResult(result.id)); }
    catch (error) { announce(error.message); }
    finally { card.dataset.busy = "false"; card.setAttribute("aria-busy", "false"); play.disabled = false; play.textContent = "▶"; }
  };
  play.addEventListener("click", (event) => { event.stopPropagation(); activate(); });
  card.addEventListener("click", (event) => { if (!event.target.closest(".learn-search-artist-link")) activate(); });
  card.addEventListener("keydown", (event) => {
    if (event.target !== card || !["Enter", " "].includes(event.key)) return;
    event.preventDefault(); activate();
  });
  return card;
};

const dominantArtist = (job) => {
  const counts = new Map();
  for (const result of job.results) {
    const key = String(result.artist || "").trim(); if (!key) continue;
    const normalized = key.toLocaleLowerCase();
    const current = counts.get(normalized) || { name: key, count: 0 }; current.count += 1; counts.set(normalized, current);
  }
  const best = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  if (!best) return null;
  const exactQuery = String(job.query || "").trim().toLocaleLowerCase() === best.name.toLocaleLowerCase();
  return exactQuery || best.count >= 2 && best.count >= Math.ceil(job.results.length * .5) ? best.name : null;
};

const renderArtistAction = (job) => {
  const name = dominantArtist(job);
  if (!name) { el.artist.replaceChildren(); return; }
  const button = document.createElement("button"); button.type = "button"; button.className = "learn-search-artist-banner";
  const icon = document.createElement("span"); icon.textContent = name.slice(0, 1).toUpperCase();
  const copy = document.createElement("span");
  const label = document.createElement("small"); label.textContent = "Artist result";
  const title = document.createElement("strong"); title.textContent = name; copy.append(label, title);
  const action = document.createElement("b"); action.textContent = "+ Add artist";
  button.append(icon, copy, action);
  button.addEventListener("click", () => {
    action.textContent = "Opening…"; button.disabled = true;
    window.dispatchEvent(new CustomEvent("learn:open-artist", { detail: {
      name, onDone: () => { action.textContent = "+ Add artist"; button.disabled = false; }
    }}));
  });
  el.artist.replaceChildren(button);
};

const render = (job) => {
  el.results.replaceChildren(...job.results.map(resultCard));
  renderArtistAction(job);
  const done = job.status === "completed" || job.status === "failed";
  el.page.setAttribute("aria-busy", done ? "false" : "true");
  el.loading.hidden = done;
  el.empty.hidden = !done || Boolean(job.results.length);
  el.stage.textContent = job.status === "searching" ? "Finding songs with lyrics…"
    : job.status === "verifying" ? "Finding songs you can play…"
      : "Starting your search…";
  el.summary.textContent = done
    ? `${job.results.length} playable ${job.results.length === 1 ? "song" : "songs"}`
    : "Playable results will appear here automatically";
};

const poll = async (id, signal) => {
  try {
    const job = await getLearnSearch(id, signal); render(job);
    if (!["completed", "failed"].includes(job.status)) pollTimer = setTimeout(() => poll(id, signal), 1400);
  } catch (error) {
    if (error.name !== "AbortError") {
      el.page.setAttribute("aria-busy", "false"); el.loading.hidden = true;
      el.summary.textContent = `${error.message || "Search failed."} Submit to try again.`;
    }
  }
};

const search = async (value) => {
  const query = String(value || "").trim();
  if (query.length < 2) return;
  stop(); revealSearch(true); controller = new AbortController();
  el.pageInput.value = query;
  el.results.replaceChildren(); el.artist.replaceChildren(); el.empty.hidden = true; el.loading.hidden = false;
  el.page.setAttribute("aria-busy", "true");
  el.summary.textContent = ""; el.stage.textContent = "Finding songs with lyrics…";
  el.scroll?.scrollTo({ top: 0, behavior: "auto" });
  try {
    const job = await createLearnSearch(query, controller.signal); render(job); await poll(job.id, controller.signal);
  } catch (error) {
    if (error.name !== "AbortError") {
      el.page.setAttribute("aria-busy", "false"); el.loading.hidden = true;
      el.summary.textContent = `${error.message || "Search failed."} Submit to try again.`;
    }
  }
};

const clearSearch = () => {
  stop(); el.pageInput.value = ""; el.results.replaceChildren(); el.artist.replaceChildren();
  el.loading.hidden = true; el.empty.hidden = true; el.summary.textContent = "Search by song, artist, or a lyric line.";
  el.page.setAttribute("aria-busy", "false"); el.pageInput.focus();
};

const close = (useHistory = true) => {
  if (useHistory && history.state?.learnSearch) { history.back(); return; }
  stop(); el.page.setAttribute("aria-busy", "false"); el.page.hidden = true; el.library.hidden = false;
  el.input.value = ""; el.pageInput.value = ""; el.results.replaceChildren();
  el.artist.replaceChildren();
  el.scroll?.scrollTo({ top: 0, behavior: "auto" });
  const destination = history.state?.[LIBRARY_TAB_HISTORY_KEY] === "music" ? "music" : "home";
  window.dispatchEvent(new CustomEvent("learn:search-closed", { detail: { destination } }));
};

export const closeLearnSearch = close;

export const initLearnSearch = ({ onPrepare } = {}) => {
  prepareHandler = onPrepare;
  el.form?.addEventListener("submit", (event) => { event.preventDefault(); search(el.input.value); });
  el.input?.addEventListener("focus", () => { if (el.input.value.trim().length >= 2) search(el.input.value); });
  el.pageForm?.addEventListener("submit", (event) => { event.preventDefault(); search(el.pageInput.value); });
  el.pageInput?.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    if (el.pageInput.value.trim().length >= 2) debounceTimer = setTimeout(() => search(el.pageInput.value), 450);
  });
  el.clear?.addEventListener("click", clearSearch);
  el.back?.addEventListener("click", close);
  window.addEventListener("learn:open-search", openSearchPage);
  window.addEventListener("learn:base-destination", () => { if (!el.page.hidden) close(false); });
  window.addEventListener("popstate", (event) => {
    if (!event.state?.learnSearch && !el.page.hidden) close(false);
  });
};
