CREATE TABLE artists (
  id TEXT PRIMARY KEY CHECK (id LIKE 'ast_%'),
  musicbrainz_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_name TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  disambiguation TEXT NOT NULL DEFAULT '',
  artist_type TEXT NOT NULL DEFAULT '',
  scan_status TEXT NOT NULL DEFAULT 'new',
  discovered_count INTEGER NOT NULL DEFAULT 0,
  learnable_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_scanned_at TEXT
);

CREATE TABLE artist_catalog_items (
  id TEXT PRIMARY KEY CHECK (id LIKE 'aci_%'),
  artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  musicbrainz_recording_id TEXT,
  lrclib_id INTEGER NOT NULL,
  track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  album TEXT NOT NULL DEFAULT '',
  duration_seconds REAL,
  synced_lyrics TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'lyrics_ready',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(artist_id, lrclib_id)
);

CREATE INDEX artist_catalog_artist_idx ON artist_catalog_items(artist_id, title);
CREATE INDEX artist_catalog_track_idx ON artist_catalog_items(track_id);
