import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { config } from "./config.js";
import { stations } from "./stations.js";

const states = new Map();
const timers = new Set();
let stopping = false;

const stationDir = (id) => path.join(config.storageDir, "stations", id, "stream");
const currentState = (id) => states.get(id) || {
  running: false, ready: false, attempts: 0, lastError: "", lastChunkAt: 0, listeners: new Set()
};

const prepareStationDirectory = (station) => {
  const directory = stationDir(station.id);
  fs.mkdirSync(directory, { recursive: true });
  // Remove obsolete HLS output from the first implementation. Live audio is now
  // broadcast as one native MP3 stream and does not continuously write segments.
  const oldHls = path.join(config.storageDir, "stations", station.id, "hls");
  if (fs.existsSync(oldHls)) fs.rmSync(oldHls, { recursive: true, force: true });
};

const schedule = (callback, delay) => {
  const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay);
  timers.add(timer);
};

const endListeners = (state) => {
  for (const response of state.listeners) {
    if (!response.destroyed) response.end();
  }
  state.listeners.clear();
};

const broadcast = (state, chunk) => {
  state.lastChunkAt = Date.now();
  state.ready = true;
  state.attempts = 0;
  state.lastError = "";
  for (const response of state.listeners) {
    if (response.destroyed || response.writableEnded) {
      state.listeners.delete(response);
      continue;
    }
    // A disconnected/very slow listener must not grow the server's memory forever.
    // One MiB still gives a mobile connection roughly a minute to recover.
    if (response.writableLength > 1024 * 1024) {
      response.destroy();
      state.listeners.delete(response);
      continue;
    }
    response.write(chunk);
  }
};

const startStation = (station) => {
  if (stopping || currentState(station.id).running) return;
  prepareStationDirectory(station);
  const previous = currentState(station.id);
  const state = { ...previous, running: true, ready: false, lastError: "", listeners: previous.listeners || new Set() };
  states.set(station.id, state);

  // Transcode once per station, never once per listener. A continuous MP3 stream is
  // handled by Android's native media pipeline and remains alive when JS is throttled
  // after the screen turns off. 128 kbps is transparent enough for these source feeds.
  const child = spawn(config.ffmpeg, [
    "-nostdin", "-hide_banner", "-loglevel", "warning",
    "-rw_timeout", "15000000",
    "-re",
    "-i", station.sourceUrl,
    "-map", "0:a:0", "-vn",
    "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "48000", "-ac", "2",
    "-f", "mp3", "-write_xing", "0", "pipe:1"
  ], { stdio: ["ignore", "pipe", "pipe"] });
  state.child = child;
  let errorTail = "";
  child.stdout.on("data", (chunk) => broadcast(state, chunk));
  child.stderr.on("data", (chunk) => { errorTail = `${errorTail}${chunk}`.slice(-1200); });
  child.on("error", (error) => { errorTail = error.message; });
  child.on("exit", () => {
    const latest = currentState(station.id);
    latest.running = false;
    latest.ready = false;
    latest.child = null;
    latest.attempts += 1;
    latest.lastError = errorTail.trim().split("\n").at(-1) || "Stream disconnected";
    endListeners(latest);
    states.set(station.id, latest);
    if (!stopping) schedule(() => startStation(station), Math.min(30_000, 2_000 * latest.attempts));
  });
};

export const startStreams = () => {
  fs.mkdirSync(path.join(config.storageDir, "database"), { recursive: true });
  for (const station of stations) startStation(station);
  const watchdog = setInterval(() => {
    for (const station of stations) {
      const state = currentState(station.id);
      state.ready = state.running && Date.now() - state.lastChunkAt < config.staleAfterMs;
      if (state.running && state.lastChunkAt && !state.ready) state.child?.kill("SIGTERM");
      else if (!state.running) startStation(station);
    }
  }, 5_000);
  timers.add(watchdog);
};

export const stopStreams = () => {
  stopping = true;
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  for (const state of states.values()) {
    endListeners(state);
    state.child?.kill("SIGTERM");
  }
};

export const stationState = (id) => {
  const state = currentState(id);
  state.ready = state.running && Date.now() - state.lastChunkAt < config.staleAfterMs;
  return state;
};

export const addListener = (id, response) => {
  if (!stations.some((station) => station.id === id)) return false;
  const state = currentState(id);
  if (!state.running) return false;
  state.listeners.add(response);
  const remove = () => state.listeners.delete(response);
  response.once("close", remove);
  response.once("error", remove);
  return true;
};
