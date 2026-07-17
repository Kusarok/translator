CREATE VIRTUAL TABLE lyrics_fts USING fts5(
  track_id UNINDEXED,
  lyrics_id UNINDEXED,
  title,
  artist,
  album,
  lyrics,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE search_jobs (
  id TEXT PRIMARY KEY CHECK (id LIKE 'srj_%'),
  query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  status TEXT NOT NULL,
  candidates_found INTEGER NOT NULL DEFAULT 0,
  lyrics_verified INTEGER NOT NULL DEFAULT 0,
  audio_verified INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE search_results (
  id TEXT PRIMARY KEY CHECK (id LIKE 'srs_%'),
  search_job_id TEXT NOT NULL REFERENCES search_jobs(id) ON DELETE CASCADE,
  lrclib_id INTEGER NOT NULL,
  track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT NOT NULL DEFAULT '',
  duration_seconds REAL,
  synced_lyrics TEXT NOT NULL,
  matched_line TEXT,
  audio_provider_id TEXT,
  audio_webpage_url TEXT,
  audio_duration_seconds REAL,
  artwork_url TEXT,
  score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(search_job_id, lrclib_id)
);

CREATE INDEX search_results_job_score_idx ON search_results(search_job_id, score DESC);
