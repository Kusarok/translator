ALTER TABLE playlists ADD COLUMN user_id TEXT NOT NULL DEFAULT 'usr_legacy';
CREATE INDEX playlists_user_updated_idx ON playlists(user_id, updated_at DESC);

CREATE TABLE user_library_tracks (
  user_id TEXT NOT NULL,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  saved_at TEXT NOT NULL,
  PRIMARY KEY(user_id, track_id)
);

CREATE TABLE user_lesson_progress (
  user_id TEXT NOT NULL,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'new',
  playback_seconds REAL NOT NULL DEFAULT 0,
  completion_percent REAL NOT NULL DEFAULT 0,
  opened_count INTEGER NOT NULL DEFAULT 0,
  last_opened_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, track_id)
);

CREATE TABLE user_artists (
  user_id TEXT NOT NULL,
  artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  PRIMARY KEY(user_id, artist_id)
);

CREATE TABLE user_daily_song_additions (
  user_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  track_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, usage_date, track_key)
);

CREATE INDEX user_library_saved_idx ON user_library_tracks(user_id, saved_at DESC);
CREATE INDEX user_progress_recent_idx ON user_lesson_progress(user_id, last_opened_at DESC);
CREATE INDEX user_artists_added_idx ON user_artists(user_id, added_at DESC);

-- Preserve the existing single-user collection for the legacy owner account.
INSERT OR IGNORE INTO user_library_tracks(user_id,track_id,saved_at)
  SELECT 'usr_legacy',id,updated_at FROM tracks;
INSERT OR IGNORE INTO user_lesson_progress(user_id,track_id,status,playback_seconds,completion_percent,opened_count,last_opened_at,updated_at)
  SELECT 'usr_legacy',track_id,status,playback_seconds,completion_percent,opened_count,last_opened_at,updated_at FROM lesson_progress;
INSERT OR IGNORE INTO user_artists(user_id,artist_id,added_at)
  SELECT 'usr_legacy',id,updated_at FROM artists;
