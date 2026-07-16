import fs from "node:fs";
import http from "node:http";
import { config } from "./config.js";
import { publicStation, stations } from "./stations.js";
import { radioFile, startStreams, stationState, stopStreams } from "./stream-manager.js";
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
  const match = /^\/stations\/(rad_[a-z_]+)\/(live\.m3u8|segment-\d+\.ts)$/.exec(url.pathname);
  if (!match) return json(res, 404, { error: "Radio stream not found." });
  const filePath = radioFile(match[1], match[2]);
  if (!filePath) return json(res, 503, { error: "This station is reconnecting." });
  const manifest = match[2].endsWith(".m3u8");
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    "Content-Type": manifest ? "application/vnd.apple.mpegurl" : "video/mp2t",
    "Content-Length": stat.size,
    "Cache-Control": manifest ? "no-store, max-age=0" : "public, max-age=120, immutable",
    "Access-Control-Allow-Origin": "*"
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(config.port, config.host, () => {
  startStreams();
  console.log(`Radio worker is running on http://${config.host}:${config.port}`);
});

const shutdown = () => { stopStreams(); server.close(() => process.exit(0)); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
