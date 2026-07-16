CREATE TABLE track_licenses (
  id TEXT PRIMARY KEY CHECK (id LIKE 'lic_%'),
  track_id TEXT NOT NULL UNIQUE REFERENCES tracks(id) ON DELETE CASCADE,
  license_code TEXT NOT NULL,
  license_url TEXT NOT NULL,
  rights_holder TEXT NOT NULL,
  attribution_text TEXT NOT NULL,
  evidence_url TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  evidence_relative_path TEXT NOT NULL,
  covers_recording INTEGER NOT NULL DEFAULT 0 CHECK (covers_recording IN (0,1)),
  covers_composition INTEGER NOT NULL DEFAULT 0 CHECK (covers_composition IN (0,1)),
  covers_lyrics INTEGER NOT NULL DEFAULT 0 CHECK (covers_lyrics IN (0,1)),
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX track_licenses_code_idx ON track_licenses(license_code);
