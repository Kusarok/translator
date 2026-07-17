import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

const directory = path.join(config.storageDir, "database");
fs.mkdirSync(directory, { recursive: true });
const db = new DatabaseSync(path.join(directory, "radio.sqlite"));
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA synchronous=NORMAL;
  CREATE TABLE IF NOT EXISTS radio_stations (
    id TEXT PRIMARY KEY CHECK(id LIKE 'rad_%'),
    name TEXT NOT NULL,
    language TEXT NOT NULL,
    language_code TEXT NOT NULL,
    source_url TEXT NOT NULL,
    artwork TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

export const seedStations = (stations) => {
  const stamp = new Date().toISOString();
  const upsert = db.prepare(`INSERT INTO radio_stations(id,name,language,language_code,source_url,artwork,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,language=excluded.language,
    language_code=excluded.language_code,source_url=excluded.source_url,artwork=excluded.artwork,updated_at=excluded.updated_at`);
  for (const station of stations) upsert.run(station.id, station.name, station.language, station.languageCode, station.sourceUrl, station.artwork, stamp, stamp);
};
