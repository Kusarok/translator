import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(process.cwd());
const dataDir = path.resolve(process.env.APP_DATA_DIR || path.join(root, "data"));
const backupRoot = path.resolve(process.env.BACKUP_DIR || path.join(root, "backups"));
const retentionDays = Math.max(1, Number.parseInt(process.env.BACKUP_RETENTION_DAYS || "7", 10));
const stamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
const destination = path.join(backupRoot, stamp);

if (!dataDir.startsWith(`${root}${path.sep}`) || !backupRoot.startsWith(`${root}${path.sep}`)) {
  throw new Error("Data and backup directories must stay inside the translator project.");
}
fs.mkdirSync(destination, { recursive: true, mode: 0o700 });

const copyNames = ["settings.json", "app-secret.key", "lyrics", "translations", "licenses", "artwork", "tracks", "radio"];
for (const name of copyNames) {
  const source = path.join(dataDir, name);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(destination, name), { recursive: true, preserveTimestamps: true });
}

const databaseSource = path.join(dataDir, "database");
const databaseDestination = path.join(destination, "database");
fs.mkdirSync(databaseDestination, { recursive: true, mode: 0o700 });
for (const name of fs.existsSync(databaseSource) ? fs.readdirSync(databaseSource) : []) {
  if (!name.endsWith(".sqlite")) continue;
  const source = path.join(databaseSource, name), target = path.join(databaseDestination, name);
  const db = new DatabaseSync(source, { readOnly: true });
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  db.close(); fs.chmodSync(target, 0o600);
}

fs.writeFileSync(path.join(destination, "backup.json"), JSON.stringify({ createdAt: new Date().toISOString(), mediaIncluded: false,
  note: "Database, licenses, lyrics, translations, artwork and application secrets. Large audio media is excluded." }, null, 2), { mode: 0o600 });

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
for (const entry of fs.readdirSync(backupRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const target = path.join(backupRoot, entry.name);
  if (fs.statSync(target).mtimeMs < cutoff) fs.rmSync(target, { recursive: true, force: true });
}
console.log(`Backup created: ${destination}`);
