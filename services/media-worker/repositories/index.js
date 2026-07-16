import { createId } from "../database/index.js";

const now = () => new Date().toISOString();
const clean = (value) => value === undefined ? null : value;
const relativePath = (value) => {
  if (!value || value.startsWith("/") || value.split(/[\\/]+/).includes("..")) {
    throw new TypeError("relativePath must stay inside the configured storage root");
  }
  return value;
};

export const createRepositories = (db) => ({
  tracks: {
    findById: (id) => db.prepare("SELECT * FROM tracks WHERE id = ?").get(id) || null,
    findByExternalId: (source, externalId) => db.prepare("SELECT * FROM tracks WHERE source = ? AND external_id = ?").get(source, externalId) || null,
    upsert(input) {
      const current = this.findByExternalId(input.source, input.externalId);
      const stamp = now();
      const id = current?.id || input.id || createId("track");
      db.prepare(`INSERT INTO tracks(id, source, external_id, source_url, title, artist, album, duration_seconds, artwork_url, created_at, updated_at, last_accessed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source, external_id) DO UPDATE SET source_url=excluded.source_url, title=excluded.title, artist=excluded.artist,
        album=excluded.album, duration_seconds=excluded.duration_seconds, artwork_url=excluded.artwork_url, updated_at=excluded.updated_at,
        last_accessed_at=excluded.last_accessed_at`).run(id, input.source, input.externalId, clean(input.sourceUrl), input.title,
        input.artist || "", input.album || "", clean(input.durationSeconds), clean(input.artworkUrl), current?.created_at || stamp, stamp, stamp);
      return this.findByExternalId(input.source, input.externalId);
    }
  },
  lyrics: {
    findById: (id) => db.prepare("SELECT * FROM lyrics WHERE id = ?").get(id) || null,
    findByExternalId: (source, externalId) => db.prepare(`SELECT * FROM lyrics WHERE source=? AND
      (external_id=? OR (source='lrclib' AND CAST(external_id AS INTEGER)=CAST(? AS INTEGER))) LIMIT 1`).get(source, String(externalId), String(externalId)) || null,
    findForTrack: (trackId) => db.prepare("SELECT * FROM lyrics WHERE track_id = ? ORDER BY updated_at DESC").all(trackId),
    allWithTracks: () => db.prepare(`SELECT l.*,t.title,t.artist,t.album FROM lyrics l JOIN tracks t ON t.id=l.track_id ORDER BY l.updated_at DESC`).all(),
    upsert(input) {
      const existing = db.prepare("SELECT * FROM lyrics WHERE track_id=? AND source=? AND content_hash=?").get(input.trackId, input.source, input.contentHash);
      if (existing) return existing;
      const stamp = now(), id = input.id || createId("lyrics");
      db.prepare("INSERT INTO lyrics VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, input.trackId, input.source, clean(input.externalId), input.language || "en", input.contentHash, relativePath(input.relativePath), stamp, stamp);
      return this.findById(id);
    }
  },
  translations: {
    findById: (id) => db.prepare("SELECT * FROM translations WHERE id = ?").get(id) || null,
    findLatest: (lyricsId, targetLanguage) => db.prepare("SELECT * FROM translations WHERE lyrics_id=? AND target_language=? ORDER BY updated_at DESC LIMIT 1").get(lyricsId, targetLanguage) || null,
    findCached(input) { return db.prepare("SELECT * FROM translations WHERE lyrics_id=? AND target_language=? AND provider=? AND model=? AND prompt_version=?").get(input.lyricsId, input.targetLanguage, input.provider, input.model, input.promptVersion) || null; },
    upsert(input) {
      const stamp = now(), existing = this.findCached(input), id = existing?.id || input.id || createId("translation");
      db.prepare(`INSERT INTO translations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(lyrics_id,target_language,provider,model,prompt_version) DO UPDATE SET content_hash=excluded.content_hash, relative_path=excluded.relative_path, updated_at=excluded.updated_at`)
        .run(id, input.lyricsId, input.targetLanguage, input.provider, input.model, input.promptVersion, input.contentHash, relativePath(input.relativePath), existing?.created_at || stamp, stamp);
      return this.findCached(input);
    }
  },
  lyricTranslationJobs: {
    findById: (id) => db.prepare("SELECT * FROM lyric_translation_jobs WHERE id=?").get(id) || null,
    findForTrack: (trackId, targetLanguage = "fa") => db.prepare(
      "SELECT * FROM lyric_translation_jobs WHERE track_id=? AND target_language=?"
    ).get(trackId, targetLanguage) || null,
    due(limit = 4) {
      return db.prepare(`SELECT * FROM lyric_translation_jobs
        WHERE (status IN ('queued','retry') AND next_attempt_at<=?)
          OR (status='running' AND updated_at<=?)
        ORDER BY next_attempt_at,created_at LIMIT ?`).all(now(), new Date(Date.now() - 5 * 60 * 1000).toISOString(), limit);
    },
    schedule(input) {
      const current = this.findForTrack(input.trackId, input.targetLanguage || "fa");
      const stamp = now(), id = current?.id || input.id || createId("lyricsTranslationJob");
      const nextAttemptAt = input.nextAttemptAt || stamp;
      const attempts = input.attempts ?? current?.attempts ?? 0;
      db.prepare(`INSERT INTO lyric_translation_jobs
        (id,track_id,target_language,status,attempts,next_attempt_at,last_error,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(track_id,target_language) DO UPDATE SET
          status=excluded.status,attempts=excluded.attempts,next_attempt_at=excluded.next_attempt_at,
          last_error=excluded.last_error,updated_at=excluded.updated_at`)
        .run(id, input.trackId, input.targetLanguage || "fa", input.status || "queued", attempts,
          nextAttemptAt, clean(input.lastError), current?.created_at || stamp, stamp);
      return this.findForTrack(input.trackId, input.targetLanguage || "fa");
    },
    start(id) {
      db.prepare(`UPDATE lyric_translation_jobs SET status='running',attempts=attempts+1,
        last_error=NULL,updated_at=? WHERE id=?`).run(now(), id);
      return this.findById(id);
    },
    retry(id, input) {
      db.prepare(`UPDATE lyric_translation_jobs SET status='retry',next_attempt_at=?,last_error=?,updated_at=?
        WHERE id=?`).run(input.nextAttemptAt, clean(input.lastError), now(), id);
      return this.findById(id);
    },
    complete(id) {
      db.prepare(`UPDATE lyric_translation_jobs SET status='completed',last_error=NULL,updated_at=? WHERE id=?`).run(now(), id);
      return this.findById(id);
    },
    fail(id, lastError) {
      db.prepare(`UPDATE lyric_translation_jobs SET status='failed',last_error=?,updated_at=? WHERE id=?`).run(clean(lastError), now(), id);
      return this.findById(id);
    }
  },
  artwork: {
    findById: (id) => db.prepare("SELECT * FROM artwork_assets WHERE id=?").get(id) || null,
    findForTrack: (trackId) => db.prepare("SELECT * FROM artwork_assets WHERE track_id=?").get(trackId) || null,
    upsert(input) {
      const existing = this.findForTrack(input.trackId);
      const stamp = now(), id = existing?.id || input.id || createId("artwork");
      db.prepare(`INSERT INTO artwork_assets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(track_id) DO UPDATE SET remote_url=excluded.remote_url, relative_path=excluded.relative_path,
        mime_type=excluded.mime_type, size_bytes=excluded.size_bytes, checksum=excluded.checksum, updated_at=excluded.updated_at`)
        .run(id, input.trackId, clean(input.remoteUrl), relativePath(input.relativePath), clean(input.mimeType),
          clean(input.sizeBytes), clean(input.checksum), existing?.created_at || stamp, stamp);
      return this.findForTrack(input.trackId);
    }
  },
  media: {
    findById: (id) => db.prepare("SELECT * FROM media_assets WHERE id = ?").get(id) || null,
    findByProviderId: (provider, providerMediaId) => db.prepare("SELECT * FROM media_assets WHERE provider=? AND provider_media_id=?").get(provider, providerMediaId) || null,
    findReadyForTrack: (trackId) => db.prepare("SELECT * FROM media_assets WHERE track_id=? AND status='ready' ORDER BY updated_at DESC LIMIT 1").get(trackId) || null,
    upsert(input) {
      const existing = input.providerMediaId ? this.findByProviderId(input.provider, input.providerMediaId) : null;
      const stamp = now(), id = existing?.id || input.id || createId("media");
      if (existing) {
        db.prepare(`UPDATE media_assets SET track_id=?, kind=?, relative_path=?, mime_type=?, size_bytes=?, duration_seconds=?, checksum=?, status=?, updated_at=?, last_verified_at=? WHERE id=?`)
          .run(input.trackId, input.kind || "audio", relativePath(input.relativePath), clean(input.mimeType), clean(input.sizeBytes), clean(input.durationSeconds), clean(input.checksum), input.status || "ready", stamp, clean(input.lastVerifiedAt), id);
      } else {
        db.prepare("INSERT INTO media_assets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(id, input.trackId, input.provider, clean(input.providerMediaId), input.kind || "audio", relativePath(input.relativePath), clean(input.mimeType), clean(input.sizeBytes), clean(input.durationSeconds), clean(input.checksum), input.status || "ready", stamp, stamp, clean(input.lastVerifiedAt));
      }
      return this.findById(id);
    }
  },
  jobs: {
    findById: (id) => db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) || null,
    pending: () => db.prepare("SELECT * FROM jobs WHERE status IN ('queued','running','inspecting','downloading','processing') ORDER BY created_at").all(),
    findActive: (trackId, jobType) => db.prepare("SELECT * FROM jobs WHERE track_id=? AND job_type=? AND status IN ('queued','running','inspecting','downloading','processing') ORDER BY created_at LIMIT 1").get(trackId, jobType) || null,
    create(input) {
      const stamp = now(), id = input.id || createId("job");
      db.prepare("INSERT INTO jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, clean(input.trackId), input.jobType, input.status || "queued", input.progress || 0, input.attempts || 0, clean(input.error), clean(input.resultId), stamp, stamp);
      return this.findById(id);
    },
    update(id, patch) {
      const current = this.findById(id);
      if (!current) return null;
      db.prepare("UPDATE jobs SET status=?, progress=?, attempts=?, error=?, result_id=?, updated_at=? WHERE id=?")
        .run(patch.status ?? current.status, patch.progress ?? current.progress, patch.attempts ?? current.attempts, patch.error === undefined ? current.error : patch.error, patch.resultId === undefined ? current.result_id : patch.resultId, now(), id);
      return this.findById(id);
    }
  },
  playlists: {
    findById: (id) => db.prepare("SELECT * FROM playlists WHERE id=?").get(id) || null,
    findByExternalId: (source, externalId) => db.prepare("SELECT * FROM playlists WHERE source=? AND external_id=?").get(source, externalId) || null,
    list: () => db.prepare(`SELECT p.*, COUNT(pt.id) AS track_count,
      (SELECT a.id FROM playlist_tracks x LEFT JOIN artwork_assets a ON a.track_id=x.track_id WHERE x.playlist_id=p.id ORDER BY x.position LIMIT 1) AS first_artwork_id,
      (SELECT t.artwork_url FROM playlist_tracks x JOIN tracks t ON t.id=x.track_id WHERE x.playlist_id=p.id ORDER BY x.position LIMIT 1) AS first_artwork_url
      FROM playlists p LEFT JOIN playlist_tracks pt ON pt.playlist_id=p.id
      GROUP BY p.id ORDER BY p.updated_at DESC`).all(),
    create(input) {
      const stamp = now(), id = input.id || createId("playlist");
      db.prepare(`INSERT INTO playlists VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.source || "local", clean(input.externalId), input.name, input.description || "",
          clean(input.sourceUrl), clean(input.artworkUrl), clean(input.snapshotId), stamp, stamp, clean(input.lastSyncedAt));
      return this.findById(id);
    },
    upsertExternal(input) {
      const existing = this.findByExternalId(input.source, input.externalId);
      if (!existing) return this.create(input);
      db.prepare(`UPDATE playlists SET name=?, description=?, source_url=?, artwork_url=?, snapshot_id=?, updated_at=?, last_synced_at=? WHERE id=?`)
        .run(input.name, input.description || "", clean(input.sourceUrl), clean(input.artworkUrl), clean(input.snapshotId), now(), now(), existing.id);
      return this.findById(existing.id);
    },
    update(id, input) {
      const current = this.findById(id);
      if (!current) return null;
      db.prepare("UPDATE playlists SET name=?,description=?,updated_at=? WHERE id=?")
        .run(String(input.name ?? current.name).trim() || current.name, String(input.description ?? current.description).trim(), now(), id);
      return this.findById(id);
    },
    delete(id) { return db.prepare("DELETE FROM playlists WHERE id=?").run(id).changes > 0; },
    addTrack(playlistId, trackId, position) {
      const id = createId("playlistTrack"), stamp = now();
      db.prepare(`INSERT INTO playlist_tracks(id,playlist_id,track_id,position,added_at) VALUES (?,?,?,?,?)
        ON CONFLICT(playlist_id,track_id) DO UPDATE SET position=excluded.position`).run(id, playlistId, trackId, position || 0, stamp);
      db.prepare("UPDATE playlists SET updated_at=? WHERE id=?").run(stamp, playlistId);
    },
    removeTrack(playlistId, trackId) {
      const removed = db.prepare("DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?").run(playlistId, trackId).changes > 0;
      if (removed) db.prepare("UPDATE playlists SET updated_at=? WHERE id=?").run(now(), playlistId);
      return removed;
    },
    tracks(playlistId) {
      return db.prepare(`SELECT t.*, pt.position, pt.id AS playlist_track_id,
        lp.status AS learning_status, lp.completion_percent,
        a.id AS artwork_id, m.id AS media_id
        FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id
        LEFT JOIN lesson_progress lp ON lp.track_id=t.id
        LEFT JOIN artwork_assets a ON a.track_id=t.id
        LEFT JOIN media_assets m ON m.id=(SELECT id FROM media_assets WHERE track_id=t.id AND status='ready' ORDER BY updated_at DESC LIMIT 1)
        WHERE pt.playlist_id=? ORDER BY pt.position`).all(playlistId);
    }
  },
  library: {
    recent(limit = 20) {
      return db.prepare(`SELECT t.*, lp.status AS learning_status, lp.completion_percent, lp.last_opened_at,
        a.id AS artwork_id, m.id AS media_id
        FROM tracks t
        LEFT JOIN lesson_progress lp ON lp.track_id=t.id
        LEFT JOIN artwork_assets a ON a.track_id=t.id
        LEFT JOIN media_assets m ON m.id=(SELECT id FROM media_assets WHERE track_id=t.id AND status='ready' ORDER BY updated_at DESC LIMIT 1)
        ORDER BY COALESCE(lp.last_opened_at,t.updated_at) DESC LIMIT ?`).all(limit);
    },
    continueLearning(limit = 8) {
      return db.prepare(`SELECT t.*, lp.status AS learning_status, lp.playback_seconds, lp.completion_percent, lp.last_opened_at,
        a.id AS artwork_id, m.id AS media_id
        FROM lesson_progress lp JOIN tracks t ON t.id=lp.track_id
        LEFT JOIN artwork_assets a ON a.track_id=t.id
        LEFT JOIN media_assets m ON m.id=(SELECT id FROM media_assets WHERE track_id=t.id AND status='ready' ORDER BY updated_at DESC LIMIT 1)
        WHERE lp.status!='completed' ORDER BY lp.last_opened_at DESC LIMIT ?`).all(limit);
    },
    touchProgress(trackId, patch = {}) {
      const stamp = now();
      db.prepare(`INSERT INTO lesson_progress(track_id,status,playback_seconds,completion_percent,opened_count,last_opened_at,updated_at)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT(track_id) DO UPDATE SET
        status=COALESCE(excluded.status,lesson_progress.status), playback_seconds=excluded.playback_seconds,
        completion_percent=excluded.completion_percent, opened_count=lesson_progress.opened_count+excluded.opened_count,
        last_opened_at=excluded.last_opened_at, updated_at=excluded.updated_at`)
        .run(trackId, patch.status || "learning", patch.playbackSeconds || 0, patch.completionPercent || 0,
          patch.incrementOpen ? 1 : 0, stamp, stamp);
    }
  },
  spotifyAccounts: {
    current: () => db.prepare("SELECT * FROM spotify_accounts ORDER BY updated_at DESC LIMIT 1").get() || null,
    upsert(input) {
      const existing = db.prepare("SELECT * FROM spotify_accounts WHERE spotify_user_id=?").get(input.spotifyUserId);
      const stamp = now(), id = existing?.id || input.id || createId("spotifyAccount");
      db.prepare(`INSERT INTO spotify_accounts VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(spotify_user_id) DO UPDATE SET
        display_name=excluded.display_name, access_token_ciphertext=excluded.access_token_ciphertext,
        refresh_token_ciphertext=excluded.refresh_token_ciphertext, scopes=excluded.scopes,
        expires_at=excluded.expires_at, updated_at=excluded.updated_at`)
        .run(id, input.spotifyUserId, input.displayName || "", input.accessTokenCiphertext,
          input.refreshTokenCiphertext, input.scopes || "", input.expiresAt, existing?.created_at || stamp, stamp);
      return this.current();
    }
  },
  artists: {
    findById: (id) => db.prepare("SELECT * FROM artists WHERE id=?").get(id) || null,
    findByMusicBrainzId: (id) => db.prepare("SELECT * FROM artists WHERE musicbrainz_id=?").get(id) || null,
    list: () => db.prepare(`SELECT ar.*,
      (SELECT aa.id FROM artist_catalog_items c JOIN artwork_assets aa ON aa.track_id=c.track_id WHERE c.artist_id=ar.id ORDER BY c.updated_at DESC LIMIT 1) AS artwork_id,
      (SELECT t.artwork_url FROM artist_catalog_items c JOIN tracks t ON t.id=c.track_id WHERE c.artist_id=ar.id AND t.artwork_url!='' ORDER BY c.updated_at DESC LIMIT 1) AS artwork_url
      FROM artists ar ORDER BY ar.updated_at DESC`).all(),
    upsert(input) {
      const current = this.findByMusicBrainzId(input.musicbrainzId), stamp = now();
      const id = current?.id || input.id || createId("artist");
      db.prepare(`INSERT INTO artists VALUES (?,?,?,?,?,?,?,'new',0,0,NULL,?,?,NULL)
        ON CONFLICT(musicbrainz_id) DO UPDATE SET name=excluded.name,sort_name=excluded.sort_name,
        country=excluded.country,disambiguation=excluded.disambiguation,artist_type=excluded.artist_type,updated_at=excluded.updated_at`)
        .run(id, input.musicbrainzId, input.name, input.sortName || "", input.country || "", input.disambiguation || "", input.type || "", current?.created_at || stamp, stamp);
      return this.findByMusicBrainzId(input.musicbrainzId);
    },
    updateScan(id, patch) {
      const current = this.findById(id); if (!current) return null;
      const completed = patch.scanStatus === "completed" ? now() : current.last_scanned_at;
      db.prepare(`UPDATE artists SET scan_status=?,discovered_count=?,learnable_count=?,error=?,updated_at=?,last_scanned_at=? WHERE id=?`)
        .run(patch.scanStatus ?? current.scan_status, patch.discoveredCount ?? current.discovered_count,
          patch.learnableCount ?? current.learnable_count, patch.error === undefined ? current.error : patch.error,
          now(), completed, id);
      return this.findById(id);
    },
    scanning: () => db.prepare("SELECT * FROM artists WHERE scan_status IN ('queued','scanning') ORDER BY updated_at").all(),
    addCatalogItem(input) {
      const existing = db.prepare("SELECT * FROM artist_catalog_items WHERE artist_id=? AND lrclib_id=?").get(input.artistId, input.lrclibId);
      const id = existing?.id || input.id || createId("artistCatalogItem"), stamp = now();
      db.prepare(`INSERT INTO artist_catalog_items(id,artist_id,musicbrainz_recording_id,lrclib_id,track_id,title,album,duration_seconds,synced_lyrics,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,'checking',?,?)
        ON CONFLICT(artist_id,lrclib_id) DO UPDATE SET musicbrainz_recording_id=excluded.musicbrainz_recording_id,
        title=excluded.title,album=excluded.album,duration_seconds=excluded.duration_seconds,synced_lyrics=excluded.synced_lyrics,updated_at=excluded.updated_at`)
        .run(id, input.artistId, clean(input.musicbrainzRecordingId), input.lrclibId, clean(input.trackId), input.title,
          input.album || "", clean(input.durationSeconds), input.syncedLyrics, existing?.created_at || stamp, stamp);
      return this.catalogItem(id);
    },
    catalogItem: (id) => db.prepare("SELECT * FROM artist_catalog_items WHERE id=?").get(id) || null,
    setTrack(id, trackId) { db.prepare("UPDATE artist_catalog_items SET track_id=?,status='ready',updated_at=? WHERE id=?").run(trackId, now(), id); return this.catalogItem(id); },
    linkTrack(id, trackId) { db.prepare("UPDATE artist_catalog_items SET track_id=?,updated_at=? WHERE id=?").run(trackId, now(), id); return this.catalogItem(id); },
    setVerification(id, input) {
      db.prepare(`UPDATE artist_catalog_items SET status=?,audio_provider_id=?,audio_webpage_url=?,audio_duration_seconds=?,artwork_url=?,updated_at=? WHERE id=?`)
        .run(input.status, clean(input.audioProviderId), clean(input.audioWebpageUrl), clean(input.audioDurationSeconds), clean(input.artworkUrl), now(), id);
      return this.catalogItem(id);
    },
    needsVerification(artistId) {
      if (artistId) return db.prepare(`SELECT * FROM artist_catalog_items
        WHERE artist_id=? AND status IN ('checking','lyrics_ready') ORDER BY created_at`).all(artistId);
      return db.prepare("SELECT * FROM artist_catalog_items WHERE status IN ('checking','lyrics_ready') ORDER BY created_at").all();
    },
    catalog(artistId) {
      return db.prepare(`WITH ranked AS (
        SELECT c.*,ROW_NUMBER() OVER (
          PARTITION BY LOWER(TRIM(c.title))
          ORDER BY CASE c.status WHEN 'ready' THEN 0 ELSE 1 END,c.updated_at DESC,c.id
        ) AS title_rank
        FROM artist_catalog_items c
        WHERE c.artist_id=? AND c.status IN ('verified','ready')
      )
        SELECT c.*,m.id AS media_id,a.id AS artwork_id,t.artwork_url AS track_artwork_url
        FROM ranked c LEFT JOIN tracks t ON t.id=c.track_id
        LEFT JOIN artwork_assets a ON a.track_id=t.id
        LEFT JOIN media_assets m ON m.id=(SELECT id FROM media_assets WHERE track_id=t.id AND status='ready' ORDER BY updated_at DESC LIMIT 1)
        WHERE c.title_rank=1 ORDER BY c.title COLLATE NOCASE`).all(artistId);
    }
  },
  search: {
    indexLyrics(input) {
      db.prepare("DELETE FROM lyrics_fts WHERE lyrics_id=?").run(input.lyricsId);
      db.prepare("INSERT INTO lyrics_fts(track_id,lyrics_id,title,artist,album,lyrics) VALUES (?,?,?,?,?,?)")
        .run(input.trackId, input.lyricsId, input.title, input.artist, input.album || "", input.lyrics);
    },
    local(query, limit = 10) {
      return db.prepare(`SELECT track_id,lyrics_id,title,artist,album,
        snippet(lyrics_fts,5,'<mark>','</mark>',' … ',16) AS matched_line,
        bm25(lyrics_fts,2.0,1.5,1.0,0.5) AS rank
        FROM lyrics_fts WHERE lyrics_fts MATCH ? ORDER BY rank LIMIT ?`).all(query, limit);
    },
    createJob(query, normalizedQuery) {
      const id = createId("searchJob"), stamp = now();
      db.prepare("INSERT INTO search_jobs VALUES (?,?,?,'queued',0,0,0,NULL,?,?)").run(id, query, normalizedQuery, stamp, stamp);
      return this.job(id);
    },
    findActive(normalizedQuery) {
      return db.prepare(`SELECT * FROM search_jobs WHERE normalized_query=?
        AND status IN ('queued','searching','verifying') ORDER BY created_at LIMIT 1`).get(normalizedQuery) || null;
    },
    findCached(normalizedQuery, updatedAfter) {
      return db.prepare(`SELECT j.* FROM search_jobs j WHERE j.normalized_query=? AND j.status='completed'
        AND j.updated_at>=? ORDER BY j.updated_at DESC LIMIT 1`).get(normalizedQuery, updatedAfter) || null;
    },
    recoverable: () => db.prepare("SELECT * FROM search_jobs WHERE status IN ('queued','searching','verifying') ORDER BY created_at").all(),
    job: (id) => db.prepare("SELECT * FROM search_jobs WHERE id=?").get(id) || null,
    updateJob(id, patch) {
      const current = this.job(id); if (!current) return null;
      db.prepare(`UPDATE search_jobs SET status=?,candidates_found=?,lyrics_verified=?,audio_verified=?,error=?,updated_at=? WHERE id=?`)
        .run(patch.status ?? current.status, patch.candidatesFound ?? current.candidates_found,
          patch.lyricsVerified ?? current.lyrics_verified, patch.audioVerified ?? current.audio_verified,
          patch.error === undefined ? current.error : patch.error, now(), id);
      return this.job(id);
    },
    addResult(input) {
      const id = input.id || createId("searchResult"), stamp = now();
      db.prepare(`INSERT INTO search_results(id,search_job_id,lrclib_id,track_id,title,artist,album,duration_seconds,
        synced_lyrics,matched_line,audio_provider_id,audio_webpage_url,audio_duration_seconds,artwork_url,score,status,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(search_job_id,lrclib_id) DO UPDATE SET
          track_id=excluded.track_id,title=excluded.title,artist=excluded.artist,album=excluded.album,
          duration_seconds=excluded.duration_seconds,synced_lyrics=excluded.synced_lyrics,matched_line=excluded.matched_line,
          audio_provider_id=excluded.audio_provider_id,audio_webpage_url=excluded.audio_webpage_url,
          audio_duration_seconds=excluded.audio_duration_seconds,artwork_url=excluded.artwork_url,
          score=excluded.score,status=excluded.status`)
        .run(id, input.searchJobId, input.lrclibId, clean(input.trackId), input.title, input.artist,
          input.album || "", clean(input.durationSeconds), input.syncedLyrics, clean(input.matchedLine),
          clean(input.audioProviderId), clean(input.audioWebpageUrl), clean(input.audioDurationSeconds),
          clean(input.artworkUrl), input.score ?? 0, input.status, stamp);
      return db.prepare("SELECT * FROM search_results WHERE search_job_id=? AND lrclib_id=?")
        .get(input.searchJobId, input.lrclibId);
    },
    results: (jobId) => db.prepare("SELECT * FROM search_results WHERE search_job_id=? AND status='ready' ORDER BY score DESC").all(jobId),
    findVerifiedByLrclibId: (lrclibId) => db.prepare(`SELECT * FROM search_results WHERE lrclib_id=? AND status='ready' AND audio_provider_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`).get(lrclibId) || null,
    result: (id) => db.prepare("SELECT * FROM search_results WHERE id=?").get(id) || null
  }
});
