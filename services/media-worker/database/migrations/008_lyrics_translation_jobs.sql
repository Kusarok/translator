CREATE TABLE lyric_translation_jobs (
  id TEXT PRIMARY KEY CHECK (id LIKE 'ltj_%'),
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  target_language TEXT NOT NULL DEFAULT 'fa',
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (track_id, target_language)
);

CREATE INDEX lyric_translation_jobs_due_idx
  ON lyric_translation_jobs(status, next_attempt_at);
