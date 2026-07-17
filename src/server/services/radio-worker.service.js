import http from "node:http";
import https from "node:https";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

const workerUrl = new URL(env.radioWorkerUrl);
const transport = workerUrl.protocol === "https:" ? https : http;

const request = (pathname, { stream = false } = {}) => new Promise((resolve, reject) => {
  const upstream = transport.get(new URL(pathname, workerUrl), { timeout: 20_000, headers: { Accept: stream ? "*/*" : "application/json" } }, (response) => {
    if (stream && response.statusCode < 400) return resolve(response);
    const chunks = [];
    response.on("data", (chunk) => chunks.push(chunk));
    response.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      let data = {};
      try { data = JSON.parse(text || "{}"); } catch { data = { error: "Radio service returned an invalid response." }; }
      if (response.statusCode >= 400) reject(new HttpError(response.statusCode, data.error || "Radio is temporarily unavailable."));
      else resolve({ status: response.statusCode, data });
    });
  });
  upstream.on("timeout", () => upstream.destroy(new Error("Radio service timed out.")));
  upstream.on("error", () => reject(new HttpError(503, "Live radio is reconnecting. Try again in a moment.")));
});

export const getRadioStations = () => request("/stations");
export const getRadioHealth = () => request("/health");
export const getRadioStream = (stationId, filename) => request(`/stations/${encodeURIComponent(stationId)}/${encodeURIComponent(filename)}`, { stream: true });
