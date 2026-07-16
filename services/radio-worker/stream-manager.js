import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { config } from "./config.js";
import { stations } from "./stations.js";

const states = new Map();
const timers = new Set();
let stopping = false;

const stationDir = (id) => path.join(config.storageDir, "stations", id, "hls");
const manifestPath = (id) => path.join(stationDir(id), "live.m3u8");
const currentState = (id) => states.get(id) || { running: false, ready: false, attempts: 0, lastError: "", updatedAt: null };

const clearOutput = (station) => {
  const directory = stationDir(station.id);
  fs.mkdirSync(directory, { recursive: true });
  for (const name of fs.readdirSync(directory)) {
    if (name === "live.m3u8" || /^segment-\d+\.ts$/.test(name)) fs.rmSync(path.join(directory, name), { force: true });
  }
  return directory;
};

const refreshReady = (station) => {
  const state = currentState(station.id);
  try {
    const age = Date.now() - fs.statSync(manifestPath(station.id)).mtimeMs;
    state.ready = age < config.staleAfterMs;
    if (state.ready) {
      state.updatedAt = new Date().toISOString();
      state.attempts = 0;
      state.lastError = "";
    }
  } catch {
    state.ready = false;
  }
  states.set(station.id, state);
  return state;
};

const schedule = (callback, delay) => {
  const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay);
  timers.add(timer);
};

const startStation = (station) => {
  if (stopping || currentState(station.id).running) return;
  const directory = clearOutput(station);
  const state = { ...currentState(station.id), running: true, ready: false, lastError: "" };
  states.set(station.id, state);

  const child = spawn(config.ffmpeg, [
    "-nostdin", "-hide_banner", "-loglevel", "warning",
    "-rw_timeout", "15000000",
    "-i", station.sourceUrl,
    "-map", "0:a:0", "-vn", "-c:a", "copy",
    "-f", "hls", "-hls_time", String(config.segmentSeconds),
    "-hls_list_size", String(config.playlistSegments),
    "-hls_start_number_source", "epoch",
    "-hls_flags", "delete_segments+omit_endlist+program_date_time",
    "-hls_segment_filename", path.join(directory, "segment-%09d.ts"),
    path.join(directory, "live.m3u8")
  ], { stdio: ["ignore", "ignore", "pipe"] });
  state.child = child;
  let errorTail = "";
  child.stderr.on("data", (chunk) => { errorTail = `${errorTail}${chunk}`.slice(-1200); });
  child.on("error", (error) => { errorTail = error.message; });
  child.on("exit", () => {
    const latest = currentState(station.id);
    latest.running = false;
    latest.ready = false;
    latest.child = null;
    latest.attempts += 1;
    latest.lastError = errorTail.trim().split("\n").at(-1) || "Stream disconnected";
    states.set(station.id, latest);
    if (!stopping) schedule(() => startStation(station), Math.min(30_000, 2_000 * latest.attempts));
  });
};

export const startStreams = () => {
  fs.mkdirSync(path.join(config.storageDir, "database"), { recursive: true });
  for (const station of stations) startStation(station);
  const watchdog = setInterval(() => {
    for (const station of stations) {
      const state = refreshReady(station);
      if (state.running && state.updatedAt && Date.now() - Date.parse(state.updatedAt) > config.staleAfterMs) {
        state.child?.kill("SIGTERM");
      } else if (!state.running) startStation(station);
    }
  }, 5_000);
  timers.add(watchdog);
};

export const stopStreams = () => {
  stopping = true;
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  for (const state of states.values()) state.child?.kill("SIGTERM");
};

export const stationState = (id) => refreshReady(stations.find((item) => item.id === id) || { id });
export const radioFile = (id, filename) => {
  if (!stations.some((station) => station.id === id)) return null;
  if (filename !== "live.m3u8" && !/^segment-\d+\.ts$/.test(filename)) return null;
  const filePath = path.join(stationDir(id), filename);
  return fs.existsSync(filePath) ? filePath : null;
};
