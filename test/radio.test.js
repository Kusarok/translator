import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { publicStation, stations } from "../services/radio-worker/stations.js";

test("live radio exposes two stable audio stations without leaking IPTV sources", () => {
  assert.deepEqual(stations.map(({ id, name }) => ({ id, name })), [
    { id: "rad_kurdish", name: "Kurdish" },
    { id: "rad_persian_nostalgia", name: "Persian Nostalgia" }
  ]);
  for (const station of stations) {
    assert.match(station.sourceUrl, /^https:\/\//);
    const visible = publicStation(station, { ready: true });
    assert.equal(visible.live, true);
    assert.equal("sourceUrl" in visible, false);
    assert.equal(visible.streamUrl, `/api/radio/stations/${station.id}/live.m3u8`);
  }
});

test("radio worker creates shared audio-only HLS with restart-safe segments", () => {
  const source = fs.readFileSync("services/radio-worker/stream-manager.js", "utf8");
  assert.match(source, /"-map", "0:a:0", "-vn", "-c:a", "copy"/);
  assert.match(source, /"-hls_start_number_source", "epoch"/);
  assert.match(source, /data.*radio|storageDir/);
});

test("music home includes a persistent animated radio player and background controls", () => {
  const html = fs.readFileSync("src/client/index.html", "utf8");
  const client = fs.readFileSync("src/client/assets/js/radio-player.js", "utf8");
  const css = fs.readFileSync("src/client/assets/css/media.css", "utf8");
  assert.match(html, /id="radioHome"/);
  assert.match(html, /id="radioPlayer"/);
  assert.match(html, /id="radioMiniPlayer"/);
  assert.match(client, /navigator\.mediaSession/);
  assert.match(client, /new MediaMetadata/);
  assert.match(client, /window\.Hls/);
  assert.match(css, /\.radio-equalizer/);
});
