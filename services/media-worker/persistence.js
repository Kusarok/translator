import { openDatabase } from "./database/index.js";
import { createRepositories } from "./repositories/index.js";
import { config } from "./config.js";

export const database = openDatabase({ storageRoot: config.dataDir });
database.prepare(`UPDATE jobs SET status='queued', error=NULL, updated_at=?
  WHERE status IN ('running','inspecting','downloading','processing')`).run(new Date().toISOString());
database.prepare(`UPDATE search_jobs SET status='queued', error=NULL, updated_at=?
  WHERE status IN ('searching','verifying')`).run(new Date().toISOString());
database.prepare(`UPDATE lyric_translation_jobs SET status='retry', next_attempt_at=?, updated_at=?
  WHERE status='running'`).run(new Date().toISOString(), new Date().toISOString());
export const repositories = createRepositories(database);
