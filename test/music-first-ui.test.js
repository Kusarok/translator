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
const app = read("src/client/assets/js/app.js");
const layoutCss = read("src/client/assets/css/layout.css");
const motionCss = read("src/client/assets/css/motion.css");
const motionJs = read("src/client/assets/js/motion.js");

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
    "learnMiniProgress",
    "musicHomeHero",
    "musicHomeSearch",
    "musicHomeAdd",
    "lessonNowPlayingTab",
    "lessonLearnTab",
    "lessonNowPlayingPanel",
    "lessonContent"
    ,"lessonTranslationState"
    ,"lessonTranslationRetry"
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

test("the music-first home exposes one clear discovery path and global navigation", () => {
  assert.match(html, /id="musicHomeHero"[\s\S]*?Find your next song/);
  assert.match(html, /id="musicHomeSearch"[^>]*>[\s\S]*?Explore<\/button>/);
  assert.match(html, /id="musicHomeAdd"[^>]*>[\s\S]*?Add link<\/button>/);
  assert.match(library, /homeSearch.*musicHomeSearch/s);
  assert.match(library, /homeAdd.*musicHomeAdd/s);
  assert.match(library, /learn:navigate/);
  assert.match(mediaCss, /\.music-home-hero\s*\{/);
});

test("bottom navigation has focused Home, Search, and Library destinations", () => {
  assert.match(library, /searchNav.*learnSearchNav/s);
  assert.match(library, /musicNav.*learnMusicNav/s);
  assert.doesNotMatch(html, /id="learnToolsNav"|id="toolsBottomNav"/);
  assert.match(mediaCss, /\.learn-bottom-nav\s*\{[^}]*grid-template-columns:\s*repeat\(3,1fr\)/s);
  assert.match(library, /learn:open-search/);
  assert.match(library, /learnLibraryTab/);
  assert.match(search, /learn:search-opened/);
  assert.match(search, /learn:base-destination/);
});

test("settings stay above navigation and remain vertically scrollable on mobile", () => {
  assert.match(layoutCss, /\.overlay\s*\{[^}]*z-index:\s*100/s);
  assert.match(layoutCss, /\.sheet\s*\{[^}]*overflow-y:\s*auto[^}]*touch-action:\s*pan-y/s);
  assert.match(html, /settings-support[\s\S]*?mailto:info@kafenet\.com/);
  assert.match(layoutCss, /\[data-mode="media"\]\s+\.translator-setting\s*\{\s*display:\s*none/);
});

test("the primary app switcher uses a consistent SVG icon system instead of emoji logos", () => {
  for (const icon of ["translate", "chat", "live", "music"]) {
    assert.match(html, new RegExp(`id="icon-${icon}"`));
    assert.match(html, new RegExp(`data-icon="${icon}"`));
  }
  assert.doesNotMatch(html.match(/<header class="topbar">[\s\S]*?<\/header>/)?.[0] || "", /🔤|💬|🎙️|▶️/);
  assert.match(app, /modeIconUse\?\.setAttribute\("href", `#icon-/);
});

test("search focus belongs to the whole control instead of drawing a second input box", () => {
  assert.match(mediaCss, /\.media-view \.learn-search-bar input:focus[^}]*outline:\s*0\s*!important/s);
  assert.match(mediaCss, /\.learn-search-bar:focus-within[^}]*box-shadow:/s);
});

test("motion is progressive, scroll-aware, and respects reduced-motion preferences", () => {
  assert.match(html, /assets\/css\/motion\.css/);
  assert.match(app, /initMotion\(\)/);
  assert.match(motionJs, /IntersectionObserver/);
  assert.match(motionJs, /MutationObserver/);
  assert.match(motionJs, /pointerdown/);
  assert.match(motionCss, /\.motion-enabled \.motion-reveal\.is-revealed/);
  assert.match(motionCss, /\.media-lesson\.is-playing \.lesson-now-art/);
  assert.match(motionCss, /@media \(prefers-reduced-motion: reduce\)/);
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
  assert.match(mediaApp, /playerSurfaceOpen/,
    "tab history must not reset the player surface or scroll position");
  assert.match(mediaApp, /layer === "input" && !playerSurfaceOpen/);
  assert.match(artist, /learnArtist: artist\.id/,
    "artist history needs a stable id so Back can restore the page");
  assert.match(artist, /openSavedArtist\(artistId\)/);
  assert.match(library, /playlistId && nodes\.playlistPage\.hidden.*showPlaylist\(playlistId\)/s,
    "playlist history needs to restore the detail page");
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

test("full player defaults to listening and keeps learning in a separate swipeable view", () => {
  assert.match(html, /id="lessonNowPlayingTab"[^>]*aria-selected="true"/);
  assert.match(html, /id="lessonLearnTab"[^>]*aria-selected="false"/);
  assert.match(html, /id="mediaLyrics"[^>]*hidden/);
  assert.match(mediaApp, /const setPlayerMode = \(mode/);
  assert.match(mediaApp, /playerMode = mode === "learn" \? "learn" : "now"/);
  assert.match(mediaApp, /touchstart/);
  assert.match(mediaApp, /touchend/);
  assert.match(mediaApp, /setPlayerMode\(dx < 0 \? "learn" : "now"\)/);
  assert.match(mediaCss, /\.lesson-mode-tabs\s*\{/);
  assert.match(mediaCss, /\.lesson-now-playing\s*\{/);
});

test("switching songs invalidates rendered lyrics and refreshes late translations", () => {
  assert.match(mediaApp, /const invalidateLyrics = \(\) => \{[\s\S]*?el\.lyrics\.replaceChildren\(\)/,
    "changing tracks must remove lyric rows and their old click handlers");
  assert.match(mediaApp, /const beginPreparation = \(\) => \{[\s\S]*?invalidateLyrics\(\)/,
    "search and artist preparation must invalidate the previous song lyrics");
  assert.match(mediaApp, /if \(track\?\.trackId !== lesson\.trackId\) \{[\s\S]*?invalidateLyrics\(\)/,
    "opening a different cached library song must invalidate the previous lyrics even without an audio element");
  assert.match(mediaApp, /renderedLyricsTrack !== lyricsTrackKey\(\) \|\| renderedLyricsLines !== track\?\.lines/,
    "the learning view must rerender when either the song or translated lines change");
});

test("lyrics translation retries stay simple and refresh without reloading", () => {
  assert.match(mediaApp, /getLyricsTranslationStatus/);
  assert.match(mediaApp, /Preparing translation…/);
  assert.match(mediaApp, /Translation isn’t ready yet\./);
  assert.match(mediaApp, /pollTranslation\(target, token/);
  assert.match(mediaApp, /translationRetry\?\.addEventListener\("click"/);
  const playerTranslationCopy = html.match(/<div class="lesson-translation-state"[\s\S]*?<\/div>/)?.[0] || "";
  assert.doesNotMatch(playerTranslationCopy, /rate limit|provider|queue|API quota/i,
    "technical translation failures must not be exposed in player copy");
});
