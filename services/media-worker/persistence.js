import { openDatabase } from "./database/index.js";
import { createRepositories } from "./repositories/index.js";
import { config } from "./config.js";

export const database = openDatabase({ storageRoot: config.dataDir });
database.prepare(`UPDATE jobs SET status='failed', error='Worker restarted before this job completed.', updated_at=?
  WHERE status IN ('queued','running','inspecting','downloading','processing')`).run(new Date().toISOString());
export const repositories = createRepositories(database);
