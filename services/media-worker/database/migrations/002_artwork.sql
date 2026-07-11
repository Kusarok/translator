CREATE TABLE artwork_assets (
  id TEXT PRIMARY KEY CHECK (id LIKE 'art_%'),
  track_id TEXT NOT NULL UNIQUE REFERENCES tracks(id) ON DELETE CASCADE,
  remote_url TEXT,
  relative_path TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  size_bytes INTEGER,
  checksum TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX artwork_track_idx ON artwork_assets(track_id);
