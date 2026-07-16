import { addTrackToLearnPlaylist, createLearnPlaylist, deleteLearnPlaylist, getLearnLibrary, getLearnPlaylist, openLearnTrack, removeTrackFromLearnPlaylist, updateLearnPlaylist } from "./api.js";

const $ = (id) => document.getElementById(id);
const nodes = {
  library: $("learnLibrary"), continueSection: $("learnContinueSection"), continueList: $("learnContinue"),
  quickSection: $("learnQuickSection"), quickAccess: $("learnQuickAccess"),
  recentSection: $("learnRecentSection"), recent: $("learnRecent"), recentTitle: $("learnRecentTitle"),
  artistsSection: $("learnArtistsSection"), artists: $("learnArtists"), artistsTitle: $("learnArtistsTitle"), artistsEmpty: $("learnArtistsEmpty"),
  playlistsSection: $("learnPlaylistsSection"), playlists: $("learnPlaylists"), playlistsTitle: $("learnPlaylistsTitle"), playlistsEmpty: $("learnPlaylistsEmpty"),
  empty: $("learnLibraryEmpty"), add: $("learnAddButton"), emptyAdd: $("learnEmptyAdd"),
  sheet: $("learnAddSheet"), sheetClose: $("learnAddClose"), newPlaylist: $("learnNewPlaylist"),
  searchNav: $("learnSearchNav"), musicNav: $("learnMusicNav"), toolsNav: $("learnToolsNav"), dailyLimit: $("learnDailyLimit"), playlistPage: $("learnPlaylistPage"), playlistBack: $("learnPlaylistBack"),
  playlistHero: $("learnPlaylistHero"), playlistTracks: $("learnPlaylistTracks"), playlistMenu: $("learnPlaylistMenu"), spotifyNote: $("learnSpotifyNote"),
  connectSpotify: $("learnConnectSpotify"), filters: $("learnLibraryFilters"),
  songsFilter: $("learnSongsFilter"), artistsFilter: $("learnArtistsFilter"), playlistsFilter: $("learnPlaylistsFilter")
  ,libraryNav: $("learnLibraryNav"), libraryTitle: $("learnLibraryTitle"), scroll: document.querySelector("#mediaView .media-scroll")
};

let openTrackHandler = null;
let prepareTrackHandler = null;
let snapshot = null;
let activePlaylist = null;
let artistRefreshTimer = 0;
const PLAYLIST_HISTORY_KEY = "learnPlaylist";
const LIBRARY_TAB_HISTORY_KEY = "learnLibraryTab";
const LIBRARY_FILTER_STORAGE_KEY = "translator_music_library_filter";
const LIBRARY_FILTERS = new Set(["songs", "artists", "playlists"]);
let libraryFilter = (() => {
  try {
    const saved = localStorage.getItem(LIBRARY_FILTER_STORAGE_KEY);
    return LIBRARY_FILTERS.has(saved) ? saved : "artists";
  } catch { return "artists"; }
})();

const announce = (message) => {
  if (!message) return;
  let toast = document.querySelector(".learn-toast");
  if (!toast) {
    toast = document.createElement("div"); toast.className = "learn-toast";
    toast.setAttribute("role", "status"); toast.setAttribute("aria-live", "polite");
    document.body.append(toast);
  }
  toast.textContent = message; toast.classList.add("is-visible");
  clearTimeout(announce.timer); announce.timer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
};

const artwork = (track, className = "") => {
  if (track.artwork) {
    const img = document.createElement("img");
    img.src = track.artwork; img.alt = ""; img.loading = "lazy"; img.className = className;
    return img;
  }
  const fallback = document.createElement("span");
  fallback.className = `learn-track-art-fallback ${className}`.trim(); fallback.textContent = "♪";
  return fallback;
};

const openTrack = async (track) => {
  try {
    const lesson = await openLearnTrack(track.id);
    openTrackHandler?.(lesson);
  } catch (error) {
    if (track.sourceUrl && /not found|not cached/i.test(error.message)) return prepareTrackHandler?.(track);
    announce(error.message || "This song could not be opened. Try again.");
  }
};

const performRowAction = async (row, state, track) => {
  if (row.dataset.busy === "true") return;
  row.dataset.busy = "true"; row.setAttribute("aria-busy", "true");
  const previous = state.textContent; state.textContent = "…";
  try { await openTrack(track); }
  finally {
    row.dataset.busy = "false"; row.setAttribute("aria-busy", "false"); state.textContent = previous;
  }
};

const trackRow = (track, index = null) => {
  const row = document.createElement("button");
  row.type = "button"; row.className = "learn-track-row";
  row.append(artwork(track));
  const copy = document.createElement("span"); copy.className = "learn-track-copy";
  const title = document.createElement("strong"); title.textContent = index == null ? track.title : `${String(index + 1).padStart(2, "0")}  ${track.title}`;
  const meta = document.createElement("small");
  const artist = document.createElement("span"); artist.className = "learn-artist-link"; artist.textContent = track.artist;
  artist.setAttribute("role", "button"); artist.tabIndex = 0;
  const openArtist = (event) => { event.preventDefault(); event.stopPropagation(); window.dispatchEvent(new CustomEvent("learn:open-artist", { detail: { name: track.artist } })); };
  artist.addEventListener("click", openArtist); artist.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") openArtist(event); });
  meta.append(artist, document.createTextNode(track.album ? ` · ${track.album}` : ""));
  copy.append(title, meta);
  const state = document.createElement("span"); state.className = "learn-track-state"; state.textContent = "▶";
  row.append(copy, state);
  row.setAttribute("aria-label", `Play ${track.title} by ${track.artist}`);
  row.addEventListener("click", () => performRowAction(row, state, track));
  return row;
};

const continueCard = (track) => {
  const card = document.createElement("button"); card.type = "button"; card.className = "learn-continue-card";
  card.append(artwork(track));
  const content = document.createElement("span");
  const title = document.createElement("strong"); title.textContent = track.title;
  const artist = document.createElement("small"); artist.textContent = track.artist;
  const progress = document.createElement("span"); progress.className = "learn-progress";
  const fill = document.createElement("span"); fill.style.width = `${Math.max(4, track.completionPercent || 0)}%`; progress.append(fill);
  content.append(title, artist, progress); card.append(content);
  card.addEventListener("click", () => openTrack(track));
  return card;
};

const playlistCard = (playlist) => {
  const card = document.createElement("button"); card.type = "button"; card.className = "learn-playlist-card";
  const cover = document.createElement("span"); cover.className = "learn-playlist-cover";
  if (playlist.artwork) { const img = document.createElement("img"); img.src = playlist.artwork; img.alt = ""; cover.append(img); }
  else cover.textContent = "♫";
  const title = document.createElement("strong"); title.textContent = playlist.name;
  const count = document.createElement("small"); count.textContent = `${playlist.trackCount} songs`;
  card.append(cover, title, count);
  card.addEventListener("click", () => showPlaylist(playlist.id).catch((error) => announce(error.message || "Playlist could not be opened.")));
  return card;
};

const artistCard = (artist) => {
  const card = document.createElement("button"); card.type = "button"; card.className = "learn-artist-card";
  const art = document.createElement("span"); art.className = "learn-artist-card-art";
  if (artist.artwork) { const img = document.createElement("img"); img.src = artist.artwork; img.alt = ""; img.loading = "lazy"; art.append(img); }
  else art.textContent = artist.name.slice(0, 1).toUpperCase() || "♪";
  const name = document.createElement("strong"); name.textContent = artist.name;
  const state = document.createElement("small");
  state.textContent = ["queued", "scanning"].includes(artist.status) ? "Adding songs…" : `${artist.learnableCount || 0} songs`;
  card.append(art, name, state);
  card.addEventListener("click", () => window.dispatchEvent(new CustomEvent("learn:open-saved-artist", { detail: { id: artist.id } })));
  return card;
};

const quickTile = ({ kind, item }) => {
  const button = document.createElement("button"); button.type = "button"; button.className = "learn-quick-tile"; button.dataset.kind = kind;
  const art = document.createElement(item.artwork ? "img" : "span");
  if (item.artwork) { art.src = item.artwork; art.alt = ""; art.loading = "lazy"; }
  else { art.className = "learn-quick-tile-art"; art.textContent = kind === "playlist" ? "♫" : kind === "artist" ? item.name?.slice(0, 1).toUpperCase() || "♪" : "♪"; }
  const copy = document.createElement("span"); copy.className = "learn-quick-tile-copy";
  const title = document.createElement("strong"); title.textContent = kind === "artist" ? item.name : item.title || item.name;
  const meta = document.createElement("small"); meta.textContent = kind === "song" ? item.artist : kind;
  copy.append(title, meta); button.append(art, copy);
  if (kind === "song") button.addEventListener("click", () => openTrack(item));
  else if (kind === "artist") button.addEventListener("click", () => window.dispatchEvent(new CustomEvent("learn:open-saved-artist", { detail: { id: item.id } })));
  else button.addEventListener("click", () => showPlaylist(item.id).catch((error) => announce(error.message || "Playlist could not be opened.")));
  return button;
};

const renderLibraryView = () => {
  if (!snapshot) return;
  const musicView = nodes.library.classList.contains("is-music-view");
  nodes.filters.hidden = !musicView;
  nodes.quickSection.hidden = musicView || !nodes.quickAccess.children.length;
  nodes.continueSection.hidden = musicView || !snapshot.continueLearning.length;
  nodes.recentSection.hidden = musicView && libraryFilter !== "songs";
  nodes.artistsSection.hidden = !musicView || libraryFilter !== "artists";
  nodes.playlistsSection.hidden = !musicView || libraryFilter !== "playlists";
  nodes.recentTitle.textContent = musicView ? "Songs" : "Recently added";
  nodes.artistsTitle.textContent = "Artists";
  nodes.playlistsTitle.textContent = "Playlists";
  nodes.recent.replaceChildren(...(musicView ? snapshot.recent : snapshot.recent.slice(0, 6)).map((track) => trackRow(track)));
  nodes.empty.hidden = Boolean(snapshot.recent.length);
  nodes.artistsEmpty.hidden = Boolean(snapshot.artists?.length);
};

const selectLibraryFilter = (filter, persist = true) => {
  libraryFilter = LIBRARY_FILTERS.has(filter) ? filter : "artists";
  nodes.library.dataset.libraryFilter = libraryFilter;
  for (const [button, value] of [[nodes.songsFilter, "songs"], [nodes.artistsFilter, "artists"], [nodes.playlistsFilter, "playlists"]]) {
    const active = value === libraryFilter;
    button?.classList.toggle("active", active);
    button?.setAttribute("aria-selected", String(active));
    button?.setAttribute("tabindex", active ? "0" : "-1");
  }
  if (persist) {
    try { localStorage.setItem(LIBRARY_FILTER_STORAGE_KEY, libraryFilter); } catch { /* Storage may be unavailable. */ }
  }
  renderLibraryView();
  nodes.scroll?.scrollTo({ top: 0, behavior: "auto" });
};

const render = (data) => {
  snapshot = data;
  clearTimeout(artistRefreshTimer);
  nodes.continueList.replaceChildren(...data.continueLearning.map(continueCard));
  nodes.artists.replaceChildren(...(data.artists || []).map(artistCard));
  if ((data.artists || []).some((artist) => ["queued", "scanning"].includes(artist.status))) {
    artistRefreshTimer = setTimeout(() => refreshLearnLibrary().catch(() => {}), 4000);
  }
  nodes.playlists.replaceChildren(...data.playlists.map(playlistCard));
  nodes.playlistsEmpty.hidden = Boolean(data.playlists.length);
  if (nodes.dailyLimit && data.quota) {
    nodes.dailyLimit.textContent = data.quota.remaining === 0 ? "Daily song limit reached" : `${data.quota.remaining} new song${data.quota.remaining === 1 ? "" : "s"} left today`;
    nodes.dailyLimit.classList.toggle("is-empty", data.quota.remaining === 0);
  }
  const quickItems = [
    data.recent[0] && { kind: "song", item: data.recent[0] },
    data.artists?.[0] && { kind: "artist", item: data.artists[0] },
    data.recent[1] && { kind: "song", item: data.recent[1] },
    data.artists?.[1] && { kind: "artist", item: data.artists[1] },
    data.playlists[0] && { kind: "playlist", item: data.playlists[0] },
    data.recent[2] && { kind: "song", item: data.recent[2] }
  ].filter(Boolean);
  nodes.quickAccess.replaceChildren(...quickItems.map(quickTile));
  nodes.spotifyNote.textContent = data.spotify.configured
    ? "Connect your account to import playlists you own or collaborate on."
    : "Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to enable account connection.";
  renderLibraryView();
};

export const refreshLearnLibrary = async () => render(await getLearnLibrary());

const showPlaylist = async (id) => {
  const playlist = await getLearnPlaylist(id);
  if (history.state?.[PLAYLIST_HISTORY_KEY] !== id) {
    history.pushState({ ...(history.state || {}), [PLAYLIST_HISTORY_KEY]: id }, "");
  }
  activePlaylist = playlist;
  nodes.library.hidden = true; nodes.playlistPage.hidden = false;
  nodes.scroll?.scrollTo({ top: 0, behavior: "auto" });
  const cover = document.createElement("span"); cover.className = "learn-playlist-cover"; cover.textContent = "♫";
  const title = document.createElement("h1"); title.textContent = playlist.name;
  const meta = document.createElement("p"); meta.textContent = `${playlist.tracks.length} songs`;
  const add = document.createElement("button"); add.type = "button"; add.className = "learn-playlist-add"; add.textContent = "+  Add songs";
  add.addEventListener("click", () => showSongPicker(playlist));
  nodes.playlistHero.replaceChildren(cover, title, meta, add);
  if (playlist.tracks.length) nodes.playlistTracks.replaceChildren(...playlist.tracks.map((track, index) => playlistTrackRow(track, index, playlist.id)));
  else {
    const empty = document.createElement("div"); empty.className = "learn-playlist-detail-empty";
    empty.innerHTML = "<span>♫</span><strong>This playlist is empty</strong><small>Add a song from your library to start listening.</small>";
    const button = document.createElement("button"); button.type = "button"; button.textContent = "Choose songs";
    button.addEventListener("click", () => showSongPicker(playlist)); empty.append(button); nodes.playlistTracks.replaceChildren(empty);
  }
};

const playlistTrackRow = (track, index, playlistId) => {
  const wrap = document.createElement("div"); wrap.className = "learn-playlist-track";
  wrap.append(trackRow(track, index));
  const remove = document.createElement("button"); remove.type = "button"; remove.className = "learn-track-remove";
  remove.setAttribute("aria-label", `Remove ${track.title}`); remove.textContent = "×";
  remove.addEventListener("click", async () => {
    remove.disabled = true;
    try {
      await removeTrackFromLearnPlaylist(playlistId, track.id);
      await Promise.all([showPlaylist(playlistId), refreshLearnLibrary()]); announce(`${track.title} removed`);
    } catch (error) { remove.disabled = false; announce(error.message || "Song could not be removed."); }
  });
  wrap.append(remove); return wrap;
};

const createSheet = (eyebrow, title) => {
  const backdrop = document.createElement("div"); backdrop.className = "learn-sheet-backdrop";
  const sheet = document.createElement("div"); sheet.className = "learn-sheet";
  sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.tabIndex = -1;
  const handle = document.createElement("div"); handle.className = "learn-sheet-handle";
  const heading = document.createElement("div"); heading.className = "learn-sheet-title";
  const copy = document.createElement("div"); copy.innerHTML = `<span>${eyebrow}</span><h2>${title}</h2>`;
  const close = document.createElement("button"); close.type = "button"; close.textContent = "×"; close.setAttribute("aria-label", "Close");
  const token = `sheet-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let afterDismiss = null;
  const onPopState = () => teardown();
  const teardown = () => {
    window.removeEventListener("popstate", onPopState); backdrop.remove();
    const callback = afterDismiss; afterDismiss = null; callback?.();
  };
  const dismiss = (callback = null) => {
    afterDismiss = callback;
    if (history.state?.learnSheet === token) history.back();
    else teardown();
  };
  close.addEventListener("click", () => dismiss());
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) dismiss(); });
  backdrop.addEventListener("keydown", (event) => { if (event.key === "Escape") dismiss(); });
  heading.append(copy, close); sheet.append(handle, heading); backdrop.append(sheet); document.body.append(backdrop);
  history.pushState({ ...(history.state || {}), learnSheet: token }, "");
  window.addEventListener("popstate", onPopState);
  requestAnimationFrame(() => sheet.focus({ preventScroll: true }));
  return { backdrop, sheet, dismiss };
};

const showSongPicker = async (playlist) => {
  const data = await getLearnLibrary();
  const existing = new Set(playlist.tracks.map((track) => track.id));
  const available = data.recent.filter((track) => !existing.has(track.id));
  const { sheet, dismiss } = createSheet("Your library", "Add songs");
  const list = document.createElement("div"); list.className = "learn-track-list learn-song-picker";
  if (!available.length) list.innerHTML = "<div class='learn-picker-empty'>Every downloaded song is already in this playlist.</div>";
  for (const track of available) {
    const row = trackRow(track); row.querySelector(".learn-track-state").textContent = "+";
    row.addEventListener("click", async (event) => {
      event.stopImmediatePropagation(); row.disabled = true;
      try {
        await addTrackToLearnPlaylist(playlist.id, { trackId: track.id });
        dismiss(); await Promise.all([showPlaylist(playlist.id), refreshLearnLibrary()]); announce(`Added ${track.title}`);
      } catch (error) { row.disabled = false; announce(error.message || "Song could not be added."); }
    }, { capture: true });
    list.append(row);
  }
  sheet.append(list);
};

const showPlaylistOptions = () => {
  if (!activePlaylist) return;
  const playlist = activePlaylist;
  const { sheet, dismiss } = createSheet("Playlist", playlist.name);
  const actions = document.createElement("div"); actions.className = "learn-playlist-actions";
  const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Edit name";
  const remove = document.createElement("button"); remove.type = "button"; remove.className = "danger"; remove.textContent = "Delete playlist";
  edit.addEventListener("click", () => dismiss(() => showEditPlaylist(playlist)));
  remove.addEventListener("click", async () => {
    if (!window.confirm(`Delete “${playlist.name}”? Songs will stay in your library.`)) return;
    remove.disabled = true;
    try {
      await deleteLearnPlaylist(playlist.id);
      dismiss(() => {
        const nextState = { ...(history.state || {}) }; delete nextState[PLAYLIST_HISTORY_KEY];
        history.replaceState(nextState, ""); activePlaylist = null; hidePlaylist(false);
      });
      await refreshLearnLibrary(); announce("Playlist deleted");
    } catch (error) { remove.disabled = false; announce(error.message || "Playlist could not be deleted."); }
  });
  actions.append(edit, remove); sheet.append(actions);
};

const showEditPlaylist = (playlist) => {
  const { sheet, dismiss } = createSheet("Edit playlist", "Playlist details");
  const form = document.createElement("form"); form.className = "learn-edit-playlist";
  const input = document.createElement("input"); input.required = true; input.maxLength = 80; input.value = playlist.name;
  const description = document.createElement("textarea"); description.maxLength = 240; description.placeholder = "Description (optional)"; description.value = playlist.description || "";
  const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = "Save changes";
  form.append(input, description, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); submit.disabled = true;
    try {
      await updateLearnPlaylist(playlist.id, { name: input.value.trim(), description: description.value.trim() });
      dismiss(); await Promise.all([showPlaylist(playlist.id), refreshLearnLibrary()]); announce("Playlist updated");
    } catch (error) { submit.disabled = false; announce(error.message || "Playlist could not be updated."); }
  });
  sheet.append(form); requestAnimationFrame(() => { input.focus(); input.select(); });
};

const hidePlaylist = (useHistory = true) => {
  if (useHistory && history.state?.[PLAYLIST_HISTORY_KEY]) { history.back(); return; }
  activePlaylist = null;
  nodes.playlistPage.hidden = true; nodes.library.hidden = false;
  nodes.scroll?.scrollTo({ top: 0, behavior: "auto" });
};
const switchLibraryTab = (tab, useHistory = true) => {
  const destination = tab === "music" ? "music" : "home";
  if (useHistory && history.state?.[LIBRARY_TAB_HISTORY_KEY] !== destination) {
    const nextState = { ...(history.state || {}), [LIBRARY_TAB_HISTORY_KEY]: destination };
    delete nextState.learnSearch;
    delete nextState.learnArtist;
    delete nextState[PLAYLIST_HISTORY_KEY];
    history.pushState(nextState, "");
  }
  nodes.playlistPage.hidden = true;
  nodes.library.hidden = false;
  nodes.library.classList.toggle("is-music-view", destination === "music");
  nodes.libraryTitle.textContent = destination === "music" ? "Your Music" : "Music";
  for (const [button, active] of [[nodes.libraryNav, destination === "home"], [nodes.searchNav, false], [nodes.musicNav, destination === "music"]]) {
    button?.classList.toggle("active", active);
    button?.setAttribute("aria-current", active ? "page" : "false");
  }
  if (destination === "music") selectLibraryFilter(libraryFilter, false);
  else renderLibraryView();
  window.dispatchEvent(new CustomEvent("learn:base-destination", { detail: { destination } }));
  nodes.scroll?.scrollTo({ top: 0, behavior: "auto" });
};
const openSheet = () => {
  if (nodes.sheet.hidden) history.pushState({ ...(history.state || {}), learnAddSheet: true }, "");
  nodes.sheet.hidden = false; requestAnimationFrame(() => $("mediaUrl")?.focus());
};
export const closeLearnAddSheet = (useHistory = true) => {
  if (useHistory && history.state?.learnAddSheet) { history.back(); return; }
  nodes.sheet.hidden = true;
  if (!useHistory && history.state?.learnAddSheet) {
    const nextState = { ...(history.state || {}) }; delete nextState.learnAddSheet;
    history.replaceState(nextState, "");
  }
};

export const showPlaylistPicker = async (track) => {
  const data = await getLearnLibrary();
  const { sheet, dismiss } = createSheet("Save song", "Choose a playlist");
  const list = document.createElement("div"); list.className = "learn-track-list";
  const playlists = data.playlists.length ? data.playlists : [await createLearnPlaylist({ name: "My learning playlist" })];
  for (const playlist of playlists) {
    const button = document.createElement("button"); button.type = "button"; button.className = "learn-track-row";
    const icon = document.createElement("span"); icon.className = "learn-track-art-fallback"; icon.textContent = "♫";
    const label = document.createElement("span"); label.className = "learn-track-copy";
    const strong = document.createElement("strong"); strong.textContent = playlist.name;
    const small = document.createElement("small"); small.textContent = `${playlist.trackCount || 0} songs`;
    label.append(strong, small); button.append(icon, label);
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await addTrackToLearnPlaylist(playlist.id, { trackId: track.trackId });
        dismiss(); await refreshLearnLibrary(); announce(`Added to ${playlist.name}`);
      } catch (error) { button.disabled = false; announce(error.message || "Song could not be added."); }
    });
    list.append(button);
  }
  sheet.append(list);
};

const showNewPlaylistDialog = () => {
  const { sheet, dismiss } = createSheet("New collection", "Create a playlist");
  const form = document.createElement("form"); form.className = "media-import";
  const label = document.createElement("label"); label.className = "media-url-label"; label.textContent = "Playlist name";
  const row = document.createElement("div"); row.className = "media-url-row";
  const field = document.createElement("span"); field.className = "media-url-field";
  const input = document.createElement("input"); input.required = true; input.maxLength = 80; input.placeholder = "Songs I’m learning";
  const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = "Create";
  field.append(input); row.append(field, submit); form.append(label, row);
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); submit.disabled = true;
    try {
      const playlist = await createLearnPlaylist({ name: input.value.trim() });
      dismiss(async () => { await refreshLearnLibrary(); await showPlaylist(playlist.id); announce("Playlist created"); });
    } catch (error) { submit.disabled = false; announce(error.message || "Playlist could not be created."); }
  });
  sheet.append(form);
  requestAnimationFrame(() => input.focus());
};

export const initLearnLibrary = ({ onOpenTrack, onPrepareTrack } = {}) => {
  openTrackHandler = onOpenTrack;
  prepareTrackHandler = onPrepareTrack;
  nodes.add?.addEventListener("click", openSheet);
  nodes.emptyAdd?.addEventListener("click", openSheet);
  nodes.sheetClose?.addEventListener("click", closeLearnAddSheet);
  nodes.sheet?.addEventListener("click", (event) => { if (event.target === nodes.sheet) closeLearnAddSheet(); });
  nodes.playlistBack?.addEventListener("click", hidePlaylist);
  nodes.playlistMenu?.addEventListener("click", showPlaylistOptions);
  nodes.libraryNav?.addEventListener("click", () => switchLibraryTab("home"));
  nodes.searchNav?.addEventListener("click", () => window.dispatchEvent(new CustomEvent("learn:open-search")));
  nodes.musicNav?.addEventListener("click", () => switchLibraryTab("music"));
  nodes.toolsNav?.addEventListener("click", () => window.dispatchEvent(new CustomEvent("app:switch-view", { detail: { view: "translator" } })));
  nodes.songsFilter?.addEventListener("click", () => selectLibraryFilter("songs"));
  nodes.artistsFilter?.addEventListener("click", () => selectLibraryFilter("artists"));
  nodes.playlistsFilter?.addEventListener("click", () => selectLibraryFilter("playlists"));
  nodes.newPlaylist?.addEventListener("click", async () => {
    showNewPlaylistDialog();
  });
  nodes.connectSpotify?.addEventListener("click", () => {
    if (snapshot?.spotify.connected) {
      nodes.spotifyNote.textContent = "Spotify is connected. Paste a playlist link above to import it.";
    } else if (snapshot?.spotify.configured) {
      window.location.assign("/api/media/spotify/connect");
    } else nodes.spotifyNote.textContent = "Spotify credentials are not configured on this server yet.";
  });
  window.addEventListener("learn:refresh-library", () => refreshLearnLibrary().catch(() => {}));
  window.addEventListener("learn:search-opened", () => {
    activePlaylist = null; nodes.playlistPage.hidden = true; nodes.library.hidden = true;
    nodes.libraryNav?.classList.remove("active"); nodes.musicNav?.classList.remove("active");
    nodes.searchNav?.classList.add("active");
    nodes.libraryNav?.setAttribute("aria-current", "false"); nodes.musicNav?.setAttribute("aria-current", "false");
    nodes.searchNav?.setAttribute("aria-current", "page");
  });
  window.addEventListener("learn:search-closed", (event) => switchLibraryTab(event.detail?.destination || "home", false));
  window.addEventListener("popstate", (event) => {
    if (!event.state?.learnAddSheet && !nodes.sheet.hidden) closeLearnAddSheet(false);
    const playlistId = event.state?.[PLAYLIST_HISTORY_KEY];
    if (playlistId && nodes.playlistPage.hidden) showPlaylist(playlistId).catch((error) => announce(error.message || "Playlist could not be opened."));
    else if (!playlistId && !nodes.playlistPage.hidden) hidePlaylist(false);
    const tab = event.state?.[LIBRARY_TAB_HISTORY_KEY] === "music" ? "music" : "home";
    if (!event.state?.learnSearch && !event.state?.learnArtist && !event.state?.[PLAYLIST_HISTORY_KEY]) switchLibraryTab(tab, false);
  });
  switchLibraryTab(history.state?.[LIBRARY_TAB_HISTORY_KEY] === "music" ? "music" : "home", false);
  refreshLearnLibrary().catch((error) => announce(error.message || "Your music could not be loaded."));
};
