-- Migration 009 may have been applied by a running/test process before its legacy
-- backfill was added. This idempotent migration preserves the original collection.
INSERT OR IGNORE INTO user_library_tracks(user_id,track_id,saved_at)
  SELECT 'usr_legacy',id,updated_at FROM tracks;

INSERT OR IGNORE INTO user_lesson_progress(user_id,track_id,status,playback_seconds,completion_percent,opened_count,last_opened_at,updated_at)
  SELECT 'usr_legacy',track_id,status,playback_seconds,completion_percent,opened_count,last_opened_at,updated_at
  FROM lesson_progress;

INSERT OR IGNORE INTO user_artists(user_id,artist_id,added_at)
  SELECT 'usr_legacy',id,updated_at FROM artists;
