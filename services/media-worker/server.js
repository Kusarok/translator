import http from "node:http";
import fs from "node:fs";
import { config } from "./config.js";
import { capabilities } from "./downloader.js";
import { platformCatalog } from "./adapters/platforms.js";
import { cleanupExpired, createJob, deleteMedia, getJob, getMedia } from "./jobs.js";
import { safeMediaPath } from "./storage.js";

const json = (res, status, body) => {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": data.length, "Cache-Control": "no-store" });
  res.end(data);
};

const body = async (req) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32 * 1024) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

const serveFile = (req, res, item, download) => {
  const filePath = safeMediaPath(item);
  if (!filePath || !fs.existsSync(filePath)) return json(res, 404, { error: "Media file not found." });
  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  const common = {
    "Content-Type": item.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=300"
  };
  if (download) common["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(item.filename)}`;
  if (!range) {
    res.writeHead(200, { ...common, "Content-Length": stat.size });
    return fs.createReadStream(filePath).pipe(res);
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
    return res.end();
  }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
  if (start > end || start >= stat.size) {
    res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
    return res.end();
  }
  res.writeHead(206, { ...common, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${stat.size}` });
  fs.createReadStream(filePath, { start, end }).pipe(res);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, capabilities: capabilities(), platforms: platformCatalog() });
    }
    if (req.method === "POST" && url.pathname === "/jobs") {
      const payload = await body(req);
      return json(res, 202, createJob(payload.url));
    }
    const jobMatch = /^\/jobs\/([a-f0-9-]+)$/.exec(url.pathname);
    if (req.method === "GET" && jobMatch) {
      const job = getJob(jobMatch[1]);
      return job ? json(res, 200, job) : json(res, 404, { error: "Media job not found." });
    }
    const mediaMatch = /^\/media\/([a-f0-9-]+)\/(stream|download)$/.exec(url.pathname);
    if (req.method === "GET" && mediaMatch) {
      const item = getMedia(mediaMatch[1]);
      return item ? serveFile(req, res, item, mediaMatch[2] === "download") : json(res, 404, { error: "Media not found." });
    }
    const deleteMatch = /^\/media\/([a-f0-9-]+)$/.exec(url.pathname);
    if (req.method === "DELETE" && deleteMatch) {
      return deleteMedia(deleteMatch[1]) ? json(res, 200, { ok: true }) : json(res, 404, { error: "Media not found." });
    }
    json(res, 404, { error: "Not found." });
  } catch (error) {
    json(res, 400, { error: error.message || "Request failed." });
  }
});

setInterval(cleanupExpired, 15 * 60 * 1000).unref();
server.listen(config.port, config.host, () => console.log(`Media worker is running on http://${config.host}:${config.port}`));
