ALTER TABLE artist_catalog_items ADD COLUMN audio_provider_id TEXT;
ALTER TABLE artist_catalog_items ADD COLUMN audio_webpage_url TEXT;
ALTER TABLE artist_catalog_items ADD COLUMN audio_duration_seconds REAL;
ALTER TABLE artist_catalog_items ADD COLUMN artwork_url TEXT;

UPDATE artist_catalog_items SET status='checking' WHERE status='lyrics_ready';
CREATE INDEX artist_catalog_status_idx ON artist_catalog_items(status, artist_id);
