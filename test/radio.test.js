import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { publicStation, stations } from "../services/radio-worker/stations.js";

test("live radio exposes four stable audio stations without leaking IPTV sources", () => {
  assert.deepEqual(stations.map(({ id, name }) => ({ id, name })), [
    { id: "rad_kurdish", name: "Kurdish" },
    { id: "rad_persian_nostalgia", name: "Persian Nostalgia" },
    { id: "rad_navahang", name: "Navahang" },
    { id: "rad_radio_javan", name: "Radio Javan" }
  ]);
  for (const station of stations) {
    assert.match(station.sourceUrl, /^https:\/\//);
    const visible = publicStation(station, { ready: true });
    assert.equal(visible.live, true);
    assert.equal("sourceUrl" in visible, false);
    assert.equal("fallbackUrls" in visible, false);
    assert.equal(visible.streamUrl, `/api/radio/stations/${station.id}/live.mp3`);
  }
});

test("radio worker creates one native background stream shared by every listener", () => {
  const source = fs.readFileSync("services/radio-worker/stream-manager.js", "utf8");
  const server = fs.readFileSync("services/radio-worker/server.js", "utf8");
  assert.match(source, /"-map", "0:a:0", "-vn"/);
  assert.match(source, /"-re"/);
  assert.match(source, /"-c:a", "libmp3lame", "-b:a", "96k"/);
  assert.match(source, /state\.listeners/);
  assert.match(source, /PREBUFFER_BYTES = 180_000/);
  assert.match(source, /Buffer\.concat\(state\.buffer/);
  assert.match(source, /station\.fallbackUrls/);
  assert.match(source, /sourceIndex \+ 1/);
  assert.match(server, /"Content-Type": "audio\/mpeg"/);
});

test("music home includes a persistent animated radio player and background controls", () => {
  const html = fs.readFileSync("src/client/index.html", "utf8");
  const client = fs.readFileSync("src/client/assets/js/radio-player.js", "utf8");
  const css = fs.readFileSync("src/client/assets/css/media.css", "utf8");
  assert.match(html, /id="radioHome"/);
  assert.match(html, /id="radioPlayer"/);
  assert.match(html, /id="radioMiniPlayer"/);
  assert.match(html, /id="radioStationTrigger"/);
  assert.match(html, /id="radioStationSheet" hidden/);
  assert.match(html, /id="radioStationSwitcher"/);
  assert.match(client, /navigator\.mediaSession/);
  assert.match(client, /new MediaMetadata/);
  assert.match(client, /scheduleReconnect = \(delay = 12_000\)/);
  assert.match(client, /timeupdate.*cancelReconnect/);
  assert.match(client, /PICKER_HISTORY_KEY/);
  assert.doesNotMatch(client, /window\.Hls/);
  assert.match(client, /new MediaMetadata/);
  assert.match(css, /\.radio-equalizer/);
  assert.match(css, /grid-template-rows: auto minmax\(0,1fr\) auto 30px auto/);
  assert.match(css, /radio-station-sheet-backdrop/);
});
