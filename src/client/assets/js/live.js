import { languages, hasRtlText } from "./constants.js";
import { t } from "./i18n.js";
import { getGoogleKey } from "./byok.js";

const el = {
  view: document.querySelector("#liveView"),
  status: document.querySelector("#liveStatus"),
  target: document.querySelector("#liveTargetLanguage"),
  transcript: document.querySelector("#liveTranscript"),
  empty: document.querySelector("#liveEmptyState"),
  mic: document.querySelector("#liveMicButton"),
  micLabel: document.querySelector("#liveMicLabel"),
  notice: document.querySelector("#liveNotice"),
  clear: document.querySelector("#liveClearButton")
};

const TARGET_KEY = "liveTargetLanguage";

const runtime = {
  available: false,
  serverAvailable: false,
  running: false,
  ws: null,
  stream: null,
  audioCtx: null,
  source: null,
  processor: null,
  sink: null,
  playCtx: null,
  playHead: 0,
  currentPair: null
};

const setStatus = (key) => {
  if (el.status) {
    el.status.textContent = t(key);
    el.status.dataset.i18n = key;
  }
};

const showNotice = (text) => {
  if (!el.notice) return;
  el.notice.textContent = text || "";
  el.notice.hidden = !text;
};

const populateTargets = () => {
  const saved = localStorage.getItem(TARGET_KEY) || "en";
  el.target.innerHTML = "";
  for (const lang of languages) {
    if (lang.code === "auto") continue;
    const option = document.createElement("option");
    option.value = lang.code;
    option.textContent = lang.native;
    el.target.appendChild(option);
  }
  el.target.value = saved;
};

const hideEmpty = () => {
  if (el.empty) el.empty.hidden = true;
};

const startPair = () => {
  hideEmpty();
  const row = document.createElement("div");
  row.className = "live-pair";
  row.innerHTML = `
    <div class="live-src" dir="auto"></div>
    <div class="live-arrow">↓</div>
    <div class="live-trans" dir="auto"></div>
  `;
  el.transcript.appendChild(row);
  el.transcript.scrollTop = el.transcript.scrollHeight;
  runtime.currentPair = {
    src: row.querySelector(".live-src"),
    trans: row.querySelector(".live-trans")
  };
  return runtime.currentPair;
};

const appendText = (which, text) => {
  const pair = runtime.currentPair || startPair();
  const node = pair[which];
  node.textContent += text;
  node.dir = hasRtlText(node.textContent) ? "rtl" : "ltr";
  el.transcript.scrollTop = el.transcript.scrollHeight;
};

const clearTranscript = () => {
  el.transcript.querySelectorAll(".live-pair").forEach((n) => n.remove());
  runtime.currentPair = null;
  if (el.empty) el.empty.hidden = false;
};

const downsample = (input, inRate, outRate) => {
  if (outRate >= inRate) return input;
  const ratio = inRate / outRate;
  const outLength = Math.floor(input.length / ratio);
  const result = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const sample = input[Math.floor(i * ratio)];
    const clamped = Math.max(-1, Math.min(1, sample));
    result[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return result;
};

const playChunk = (arrayBuffer) => {
  if (!runtime.playCtx) return;
  const pcm = new Int16Array(arrayBuffer);
  const frames = pcm.length;
  if (!frames) return;
  const buffer = runtime.playCtx.createBuffer(1, frames, 24000);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) channel[i] = pcm[i] / 0x8000;

  const source = runtime.playCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(runtime.playCtx.destination);
  const now = runtime.playCtx.currentTime;
  const startAt = Math.max(now, runtime.playHead);
  source.start(startAt);
  runtime.playHead = startAt + buffer.duration;
};

const handleMessage = (event) => {
  if (typeof event.data !== "string") {
    playChunk(event.data);
    return;
  }
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch {
    return;
  }
  if (msg.type === "ready") {
    setStatus("liveListening");
    beginCapture();
  } else if (msg.type === "input") {
    appendText("src", msg.text);
  } else if (msg.type === "output") {
    appendText("trans", msg.text);
  } else if (msg.type === "turn") {
    runtime.currentPair = null;
  } else if (msg.type === "error") {
    showNotice(msg.message);
    stop();
  }
};

const beginCapture = () => {
  const ctx = runtime.audioCtx;
  runtime.source = ctx.createMediaStreamSource(runtime.stream);
  runtime.processor = ctx.createScriptProcessor(4096, 1, 1);
  runtime.sink = ctx.createGain();
  runtime.sink.gain.value = 0;

  runtime.processor.onaudioprocess = (event) => {
    if (!runtime.ws || runtime.ws.readyState !== WebSocket.OPEN) return;
    const input = event.inputBuffer.getChannelData(0);
    const pcm16 = downsample(input, ctx.sampleRate, 16000);
    runtime.ws.send(pcm16.buffer);
  };

  runtime.source.connect(runtime.processor);
  runtime.processor.connect(runtime.sink);
  runtime.sink.connect(ctx.destination);
};

const start = async () => {
  if (runtime.running) return;

  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    showNotice(t("liveInsecure"));
    return;
  }
  if (!runtime.available) {
    showNotice(t("liveNoKey"));
    return;
  }

  showNotice("");
  setStatus("liveConnecting");
  el.mic.classList.add("recording");
  el.micLabel.textContent = t("liveStop");
  runtime.running = true;

  try {
    runtime.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    showNotice(t("liveMicDenied"));
    resetUi();
    return;
  }

  runtime.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  runtime.playCtx = new (window.AudioContext || window.webkitAudioContext)();
  runtime.playHead = 0;

  const proto = location.protocol === "https:" ? "wss" : "ws";
  runtime.ws = new WebSocket(`${proto}://${location.host}/api/live`);
  runtime.ws.binaryType = "arraybuffer";

  runtime.ws.addEventListener("open", () => {
    const payload = { type: "start", targetLanguage: el.target.value };
    const byokKey = getGoogleKey();
    if (byokKey) payload.apiKey = byokKey;
    runtime.ws.send(JSON.stringify(payload));
  });
  runtime.ws.addEventListener("message", handleMessage);
  runtime.ws.addEventListener("close", () => stop());
  runtime.ws.addEventListener("error", () => {
    showNotice(t("liveConnFailed"));
    stop();
  });
};

const resetUi = () => {
  runtime.running = false;
  el.mic.classList.remove("recording");
  el.micLabel.textContent = t("liveStart");
  setStatus("liveIdle");
};

const stop = () => {
  if (!runtime.running && !runtime.ws) return resetUi();

  try {
    if (runtime.ws?.readyState === WebSocket.OPEN) runtime.ws.send(JSON.stringify({ type: "stop" }));
  } catch {}
  try { runtime.processor?.disconnect(); } catch {}
  try { runtime.source?.disconnect(); } catch {}
  try { runtime.sink?.disconnect(); } catch {}
  try { runtime.stream?.getTracks().forEach((track) => track.stop()); } catch {}
  try { runtime.audioCtx?.close(); } catch {}
  try { if (runtime.ws && runtime.ws.readyState <= 1) runtime.ws.close(); } catch {}

  runtime.ws = null;
  runtime.processor = null;
  runtime.source = null;
  runtime.sink = null;
  runtime.stream = null;
  runtime.audioCtx = null;
  runtime.currentPair = null;
  resetUi();
};

const toggle = () => {
  if (runtime.running) stop();
  else start();
};

export const stopLive = () => stop();

const refreshAvailability = () => {
  runtime.available = runtime.serverAvailable || Boolean(getGoogleKey());
  if (!runtime.available) {
    showNotice(t("liveNoKey"));
  } else if (el.notice && el.notice.textContent === t("liveNoKey")) {
    showNotice("");
  }
};

export const setLiveAvailable = (available) => {
  runtime.serverAvailable = Boolean(available);
  refreshAvailability();
};

export const refreshLiveAvailability = () => refreshAvailability();

export const applyLiveTranslations = () => {
  if (el.status?.dataset.i18n) setStatus(el.status.dataset.i18n);
  el.micLabel.textContent = runtime.running ? t("liveStop") : t("liveStart");
  if (el.empty) el.empty.textContent = t("liveHint");
};

export const initLive = () => {
  populateTargets();

  el.mic.addEventListener("click", toggle);
  el.clear.addEventListener("click", clearTranscript);
  el.target.addEventListener("change", () => {
    localStorage.setItem(TARGET_KEY, el.target.value);
    if (runtime.running) {
      stop();
      start();
    }
  });
};
