import http from "node:http";
import https from "node:https";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

const workerUrl = new URL(env.mediaWorkerUrl);
const transport = workerUrl.protocol === "https:" ? https : http;

const workerRequest = ({ method = "GET", pathname, body, headers = {}, stream = false }) =>
  new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const request = transport.request(new URL(pathname, workerUrl), {
      method,
      headers: {
        Accept: "application/json",
        ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
        ...headers
      },
      timeout: 30000
    }, (response) => {
      if (stream && response.statusCode < 400) return resolve(response);
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data = {};
        try { data = JSON.parse(text || "{}"); } catch { data = { error: text || "Media worker returned an invalid response." }; }
        if (response.statusCode >= 400) reject(new HttpError(response.statusCode, data.error || "Media request failed."));
        else resolve({ status: response.statusCode, data, headers: response.headers });
      });
    });
    request.on("timeout", () => request.destroy(new Error("Media worker did not respond in time.")));
    request.on("error", () => reject(new HttpError(503, "Media service is temporarily unavailable.")));
    if (payload) request.write(payload);
    request.end();
  });

export const mediaHealth = () => workerRequest({ pathname: "/health" });
export const createMediaJob = (url) => workerRequest({ method: "POST", pathname: "/jobs", body: { url } });
export const getMediaJob = (id) => workerRequest({ pathname: `/jobs/${encodeURIComponent(id)}` });
export const removeMedia = (id) => workerRequest({ method: "DELETE", pathname: `/media/${encodeURIComponent(id)}` });
export const mediaStream = (id, kind, range) => workerRequest({
  pathname: `/media/${encodeURIComponent(id)}/${kind}`,
  headers: range ? { Range: range } : {},
  stream: true
});
