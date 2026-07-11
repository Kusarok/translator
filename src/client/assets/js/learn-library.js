import { addTrackToLearnPlaylist, createLearnPlaylist, getLearnLibrary, getLearnPlaylist, openLearnTrack } from "./api.js";

const $ = (id) => document.getElementById(id);
const nodes = {
  library: $("learnLibrary"), continueSection: $("learnContinueSection"), continueList: $("learnContinue"),
  playlists: $("learnPlaylists"), playlistsEmpty: $("learnPlaylistsEmpty"), recent: $("learnRecent"),
  empty: $("learnLibraryEmpty"), add: $("learnAddButton"), emptyAdd: $("learnEmptyAdd"),
  sheet: $("learnAddSheet"), sheetClose: $("learnAddClose"), newPlaylist: $("learnNewPlaylist"),
  playlistsNav: $("learnPlaylistsNav"), playlistPage: $("learnPlaylistPage"), playlistBack: $("learnPlaylistBack"),
  playlistHero: $("learnPlaylistHero"), playlistTracks: $("learnPlaylistTracks"), spotifyNote: $("learnSpotifyNote"),
  connectSpotify: $("learnConnectSpotify")
  ,libraryNav: $("learnLibraryNav"), libraryTitle: $("learnLibraryTitle"), scroll: document.querySelector("#mediaView .media-scroll")
};

let openTrackHandler = null;
let prepareTrackHandler = null;
let snapshot = null;

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
    throw error;
  }
};

const trackRow = (track, index = null) => {
  const row = document.createElement("button");
  row.type = "button"; row.className = "learn-track-row";
  row.append(artwork(track));
  const copy = document.createElement("span"); copy.className = "learn-track-copy";
  const title = document.createElement("strong"); title.textContent = index == null ? track.title : `${String(index + 1).padStart(2, "0")}  ${track.title}`;
  const meta = document.createElement("small"); meta.textContent = `${track.artist}${track.album ? ` · ${track.album}` : ""}`;
  copy.append(title, meta);
  const state = document.createElement("span"); state.className = "learn-track-state"; state.textContent = track.ready ? "▶" : "○";
  row.append(copy, state);
  row.addEventListener("click", () => openTrack(track).catch(() => {}));
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
  card.addEventListener("click", () => openTrack(track).catch(() => {}));
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
  card.addEventListener("click", () => showPlaylist(playlist.id));
  return card;
};

const render = (data) => {
  snapshot = data;
  nodes.continueList.replaceChildren(...data.continueLearning.map(continueCard));
  nodes.continueSection.hidden = !data.continueLearning.length;
  nodes.playlists.replaceChildren(...data.playlists.map(playlistCard));
  nodes.playlistsEmpty.hidden = Boolean(data.playlists.length);
  nodes.recent.replaceChildren(...data.recent.map((track) => trackRow(track)));
  nodes.empty.hidden = Boolean(data.recent.length);
  nodes.spotifyNote.textContent = data.spotify.configured
    ? "Connect your account to import playlists you own or collaborate on."
    : "Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to enable account connection.";
};

export const refreshLearnLibrary = async () => render(await getLearnLibrary());

const showPlaylist = async (id) => {
  const playlist = await getLearnPlaylist(id);
  nodes.library.hidden = true; nodes.playlistPage.hidden = false;
  nodes.scroll?.scrollTo({ top: 0, behavior: "auto" });
  const cover = document.createElement("span"); cover.className = "learn-playlist-cover"; cover.textContent = "♫";
  const title = document.createElement("h1"); title.textContent = playlist.name;
  const meta = document.createElement("p"); meta.textContent = `${playlist.tracks.length} songs · Learning playlist`;
  nodes.playlistHero.replaceChildren(cover, title, meta);
  nodes.playlistTracks.replaceChildren(...playlist.tracks.map((track, index) => trackRow(track, index)));
};

const hidePlaylist = () => {
  nodes.playlistPage.hidden = true; nodes.library.hidden = false;
  nodes.scroll?.scrollTo({ top: 0, behavior: "auto" });
};
const switchLibraryTab = (tab) => {
  const playlists = tab === "playlists";
  nodes.library.classList.toggle("is-playlists-view", playlists);
  nodes.libraryTitle.textContent = playlists ? "Playlists" : "Learn";
  nodes.libraryNav.classList.toggle("active", !playlists);
  nodes.playlistsNav.classList.toggle("active", playlists);
  nodes.scroll?.scrollTo({ top: 0, behavior: "auto" });
};
const openSheet = () => { nodes.sheet.hidden = false; requestAnimationFrame(() => $("mediaUrl")?.focus()); };
export const closeLearnAddSheet = () => { nodes.sheet.hidden = true; };

export const showPlaylistPicker = async (track) => {
  const data = await getLearnLibrary();
  const backdrop = document.createElement("div"); backdrop.className = "learn-sheet-backdrop";
  const sheet = document.createElement("div"); sheet.className = "learn-sheet";
  const handle = document.createElement("div"); handle.className = "learn-sheet-handle";
  const heading = document.createElement("div"); heading.className = "learn-sheet-title";
  const copy = document.createElement("div"); copy.innerHTML = "<span>Save song</span><h2>Choose a playlist</h2>";
  const close = document.createElement("button"); close.type = "button"; close.textContent = "×";
  heading.append(copy, close);
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
      await addTrackToLearnPlaylist(playlist.id, { trackId: track.trackId });
      backdrop.remove(); await refreshLearnLibrary();
    });
    list.append(button);
  }
  close.addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) backdrop.remove(); });
  sheet.append(handle, heading, list); backdrop.append(sheet); document.body.append(backdrop);
};

const showNewPlaylistDialog = () => {
  const backdrop = document.createElement("div"); backdrop.className = "learn-sheet-backdrop";
  const sheet = document.createElement("div"); sheet.className = "learn-sheet";
  const handle = document.createElement("div"); handle.className = "learn-sheet-handle";
  const heading = document.createElement("div"); heading.className = "learn-sheet-title";
  const copy = document.createElement("div"); copy.innerHTML = "<span>New collection</span><h2>Create a playlist</h2>";
  const close = document.createElement("button"); close.type = "button"; close.textContent = "×"; heading.append(copy, close);
  const form = document.createElement("form"); form.className = "media-import";
  const label = document.createElement("label"); label.className = "media-url-label"; label.textContent = "Playlist name";
  const row = document.createElement("div"); row.className = "media-url-row";
  const field = document.createElement("span"); field.className = "media-url-field";
  const input = document.createElement("input"); input.required = true; input.maxLength = 80; input.placeholder = "Songs I’m learning";
  const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = "Create";
  field.append(input); row.append(field, submit); form.append(label, row);
  const dismiss = () => backdrop.remove(); close.addEventListener("click", dismiss);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) dismiss(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); submit.disabled = true;
    const playlist = await createLearnPlaylist({ name: input.value.trim() });
    dismiss(); await refreshLearnLibrary(); await showPlaylist(playlist.id);
  });
  sheet.append(handle, heading, form); backdrop.append(sheet); document.body.append(backdrop);
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
  nodes.libraryNav?.addEventListener("click", () => switchLibraryTab("library"));
  nodes.playlistsNav?.addEventListener("click", () => switchLibraryTab("playlists"));
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
  refreshLearnLibrary().catch(() => {});
};
