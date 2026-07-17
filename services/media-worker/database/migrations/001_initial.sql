CREATE TABLE tracks (
  id TEXT PRIMARY KEY CHECK (id LIKE 'trk_%'),
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  source_url TEXT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  album TEXT NOT NULL DEFAULT '',
  duration_seconds REAL,
  artwork_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_accessed_at TEXT NOT NULL,
  UNIQUE (source, external_id)
);

CREATE TABLE lyrics (
  id TEXT PRIMARY KEY CHECK (id LIKE 'lyr_%'),
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  content_hash TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (track_id, source, content_hash),
  UNIQUE (source, external_id)
);

CREATE TABLE translations (
  id TEXT PRIMARY KEY CHECK (id LIKE 'trn_%'),
  lyrics_id TEXT NOT NULL REFERENCES lyrics(id) ON DELETE CASCADE,
  target_language TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (lyrics_id, target_language, provider, model, prompt_version)
);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY CHECK (id LIKE 'med_%'),
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_media_id TEXT,
  kind TEXT NOT NULL DEFAULT 'audio',
  relative_path TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  size_bytes INTEGER,
  duration_seconds REAL,
  checksum TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_verified_at TEXT,
  UNIQUE (provider, provider_media_id)
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY CHECK (id LIKE 'job_%'),
  track_id TEXT REFERENCES tracks(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  result_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX lyrics_track_idx ON lyrics(track_id);
CREATE INDEX translations_lyrics_idx ON translations(lyrics_id);
CREATE INDEX media_assets_track_idx ON media_assets(track_id);
CREATE INDEX jobs_track_idx ON jobs(track_id);
CREATE UNIQUE INDEX jobs_one_active_idx ON jobs(track_id, job_type)
  WHERE status IN ('queued', 'running', 'inspecting', 'downloading', 'processing');
