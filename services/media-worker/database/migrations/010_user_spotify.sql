ALTER TABLE spotify_accounts ADD COLUMN user_id TEXT NOT NULL DEFAULT 'usr_legacy';
CREATE INDEX spotify_accounts_user_idx ON spotify_accounts(user_id, updated_at DESC);
