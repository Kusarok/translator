import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const html = read("src/client/index.html");
const library = read("src/client/assets/js/learn-library.js");
const search = read("src/client/assets/js/learn-search.js");
const artist = read("src/client/assets/js/artist-hub.js");
const mediaApp = read("src/client/assets/js/media-app.js");
const mediaCss = read("src/client/assets/css/media.css");

const ids = (source) => [...source.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);

test("music-first shell keeps every primary destination and the persistent mini player", () => {
  const requiredIds = [
    "mediaView",
    "learnLibrary",
    "learnSearchForm",
    "learnSearchNav",
    "learnSearchPage",
    "learnArtistsSection",
    "learnArtistPage",
    "learnPlaylistsSection",
    "learnMusicNav",
    "learnLibraryFilters",
    "learnSongsFilter",
    "learnArtistsFilter",
    "learnPlaylistsFilter",
    "learnQuickAccess",
    "learnPlaylistPage",
    "learnMiniPlayer",
    "learnMiniOpen",
    "learnMiniPlay",
    "learnMiniProgress"
  ];

  const pageIds = new Set(ids(html));
  for (const id of requiredIds) assert.ok(pageIds.has(id), `missing music UI #${id}`);
  assert.equal(ids(html).length, pageIds.size, "duplicate ids make navigation and playback unpredictable");

  assert.match(html, /<\/div>\s*<nav class="learn-bottom-nav"[\s\S]*?<div class="learn-mini-player"/,
    "persistent navigation and mini player must stay outside scrolling page content");
  assert.match(mediaCss, /\.learn-mini-player\s*\{[^}]*position:\s*fixed/s);
  assert.match(mediaCss, /\.learn-bottom-nav\s*\{[^}]*grid-template-columns:\s*repeat\(3,1fr\)/s);
  assert.match(mediaCss, /body\.mini-player-active\s+\.learn-library[\s\S]*?\{[^}]*padding-bottom:/s,
    "library content must not be hidden behind the player");
});

test("bottom navigation has real Home, Search, and Your Music destinations", () => {
  assert.match(library, /searchNav.*learnSearchNav/s);
  assert.match(library, /musicNav.*learnMusicNav/s);
  assert.match(library, /learn:open-search/);
  assert.match(library, /learnLibraryTab/);
  assert.match(search, /learn:search-opened/);
  assert.match(search, /learn:base-destination/);
});

test("Your Music filters songs, artists, and playlists and remembers the choice", () => {
  assert.match(library, /translator_music_library_filter/);
  assert.match(library, /localStorage\.getItem\(LIBRARY_FILTER_STORAGE_KEY\)/);
  assert.match(library, /localStorage\.setItem\(LIBRARY_FILTER_STORAGE_KEY, libraryFilter\)/);
  assert.match(library, /selectLibraryFilter\("songs"\)/);
  assert.match(library, /selectLibraryFilter\("artists"\)/);
  assert.match(library, /selectLibraryFilter\("playlists"\)/);
  assert.match(library, /data\.artists\?\.\[0\].*kind: "artist"/s,
    "Home quick access should surface saved artists near the top");
  assert.match(mediaCss, /\.learn-quick-grid\s*\{/);
});

test("music subpages retain explicit Back and browser/Android history handling", () => {
  for (const id of ["learnSearchBack", "learnArtistBack", "learnPlaylistBack", "mediaResultBack"]) {
    assert.match(html, new RegExp(`id=["']${id}["'][^>]*type=["']button["']`), `${id} must be a non-submit button`);
  }

  assert.match(search, /addEventListener\(["']popstate["']/);
  assert.match(library, /addEventListener\(["']popstate["']/);
  assert.match(artist, /addEventListener\(["']popstate["']/);
  assert.match(mediaApp, /addEventListener\(["']popstate["']/);
  assert.match(search, /history\.pushState/);
  assert.match(library, /history\.pushState/);
  assert.match(artist, /history\.pushState/);
});

test("background pipeline jargon is not exposed in music UI copy", () => {
  const clientCopy = [html, library, search, artist].join("\n");
  const internalStateTokens = new Set(["queued", "scanning", "verified", "verifying", "syncing", "synced"]);
  const stringLiterals = [...clientCopy.matchAll(/(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g)]
    .map((match) => match[2].trim())
    .filter((value) => value && !internalStateTokens.has(value.toLowerCase()));
  const forbidden = [
    /waiting\s+in\s+(?:the\s+)?queue/i,
    /\bqueued\b/i,
    /\bverify(?:ing|ied)?\b/i,
    /\bsync(?:ing|ed)?\b/i
  ];

  const offenders = stringLiterals.filter((value) => forbidden.some((phrase) => phrase.test(value)));
  assert.deepEqual(offenders, [],
    "technical pipeline copy must be translated to simple states such as Preparing or Ready");
  assert.doesNotMatch(html, />\s*(?:Queued|Verified|Syncing|Waiting in queue)\s*</i,
    "internal states must not appear as visible fallback HTML");
});

test("mini player exposes one predictable open/play/close control contract", () => {
  assert.match(html, /id="learnMiniOpen"[^>]*aria-label="Open now playing"/);
  assert.match(html, /id="learnMiniPlay"[^>]*aria-label="Play"/);
  assert.match(html, /id="learnMiniClose"[^>]*aria-label="Close player"/);
  assert.match(mediaApp, /miniPlay\?\.setAttribute\("aria-label",\s*playing\s*\?\s*"Pause"\s*:\s*"Play"\)/);
  assert.match(mediaApp, /miniOpen\?\.addEventListener\("click"/);
  assert.match(mediaApp, /miniPlay\?\.addEventListener\("click"/);
  assert.match(mediaApp, /miniClose\?\.addEventListener\("click"/);
  assert.match(mediaApp, /history\.replaceState\(historyState\("lesson"\)/,
    "ready songs should replace the temporary result step so Back returns to the originating music page");
});
