import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "migrations");

const migrations = () => fs.readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => ({ version: Number(name.split("_", 1)[0]), name, sql: fs.readFileSync(path.join(migrationsDir, name), "utf8") }));

export const databasePath = (storageRoot) => path.join(path.resolve(storageRoot), "database", "translator.sqlite");

export const openDatabase = ({ storageRoot, filename } = {}) => {
  if (!filename && !storageRoot) throw new TypeError("storageRoot or filename is required");
  const target = filename || databasePath(storageRoot);
  if (target !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
  const db = new DatabaseSync(target);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?");
  const record = db.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)");
  try {
    for (const migration of migrations()) {
      if (applied.get(migration.version)) continue;
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec(migration.sql);
        record.run(migration.version, migration.name, new Date().toISOString());
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
};

export { createId, idPrefixes } from "./ids.js";
