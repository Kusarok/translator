import http from "node:http";
import { config } from "./config.js";
import { publicStation, stations } from "./stations.js";
import { addListener, startStreams, stationState, stopStreams } from "./stream-manager.js";
import { seedStations } from "./database.js";

seedStations(stations);

const json = (res, status, payload) => {
  const data = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": data.length, "Cache-Control": "no-store" });
  res.end(data);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." });
  if (url.pathname === "/health") {
    const list = stations.map((station) => publicStation(station, stationState(station.id)));
    return json(res, 200, { ok: true, stations: list, live: list.filter((item) => item.live).length });
  }
  if (url.pathname === "/stations") {
    return json(res, 200, { stations: stations.map((station) => publicStation(station, stationState(station.id))) });
  }
  const match = /^\/stations\/(rad_[a-z_]+)\/live\.mp3$/.exec(url.pathname);
  if (!match) return json(res, 404, { error: "Radio stream not found." });
  if (!stationState(match[1]).running) return json(res, 503, { error: "This station is reconnecting." });
  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Accept-Ranges": "none",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
    "icy-name": stations.find((station) => station.id === match[1])?.name || "Live Radio",
    "icy-genre": "Music",
    "icy-br": "96"
  });
  res.flushHeaders();
  if (!addListener(match[1], res)) res.end();
});

server.listen(config.port, config.host, () => {
  startStreams();
  console.log(`Radio worker is running on http://${config.host}:${config.port}`);
});

const shutdown = () => { stopStreams(); server.close(() => process.exit(0)); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
