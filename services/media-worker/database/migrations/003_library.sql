CREATE TABLE playlists (
  id TEXT PRIMARY KEY CHECK (id LIKE 'pls_%'),
  source TEXT NOT NULL DEFAULT 'local',
  external_id TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  artwork_url TEXT,
  snapshot_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_synced_at TEXT,
  UNIQUE(source, external_id)
);

CREATE TABLE playlist_tracks (
  id TEXT PRIMARY KEY CHECK (id LIKE 'plt_%'),
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL,
  UNIQUE(playlist_id, track_id)
);

CREATE TABLE lesson_progress (
  track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'new',
  playback_seconds REAL NOT NULL DEFAULT 0,
  completion_percent REAL NOT NULL DEFAULT 0,
  opened_count INTEGER NOT NULL DEFAULT 0,
  last_opened_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX playlists_updated_idx ON playlists(updated_at DESC);
CREATE INDEX playlist_tracks_order_idx ON playlist_tracks(playlist_id, position);
CREATE INDEX lesson_progress_recent_idx ON lesson_progress(last_opened_at DESC);
