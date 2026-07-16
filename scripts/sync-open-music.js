#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { config } from "../services/media-worker/config.js";
import { createId } from "../services/media-worker/database/index.js";
import { repositories } from "../services/media-worker/persistence.js";

const USER_AGENT = "TranslatorOpenMusic/1.0 (+https://server.raminexch.store)";
const CATALOG = Object.freeze({
  id: "josh-woodward",
  artist: "Josh Woodward",
  sitemap: "https://www.joshwoodward.com/sitemap.xml",
  origin: "https://www.joshwoodward.com",
  licenseCode: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/"
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const relative = (target) => path.relative(config.dataDir, target).split(path.sep).join("/");
const htmlDecode = (value) => String(value || "").replaceAll("&amp;", "&").replaceAll("&#x27;", "'")
  .replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">");

const fetchRetry = async (url, { attempts = 4 } = {}) => {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xml,audio/mpeg,image/*;q=0.8,*/*;q=0.5" },
        redirect: "follow", signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response;
    } catch (error) {
      last = error;
      if (attempt < attempts) await sleep(attempt * 1200);
    }
  }
  throw last;
};

const jsonLdFrom = (html) => {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(htmlDecode(match[1]).trim());
      if (value?.["@type"] === "MusicRecording") return value;
    } catch { /* Continue until the MusicRecording declaration is found. */ }
  }
  return null;
};

const primaryMp3From = (html) => {
  for (const match of html.matchAll(/\{[^{}]{0,900}"format":"MP3"[^{}]{0,900}\}/g)) {
    try {
      const clip = JSON.parse(match[0]);
      if (clip.format === "MP3" && clip.type === "Primary" && clip.permission === "Free" && clip.url) return clip;
    } catch { /* Ignore framework data that only resembles a clip object. */ }
  }
  const audioUrl = html.match(/<audio[^>]+src=["']([^"']+\.mp3)["']/i)?.[1];
  if (audioUrl) return { format: "MP3", type: "Primary", permission: "Free", url: htmlDecode(audioUrl), bytes: null };
  return null;
};

const artworkFrom = (html, base) => {
  const encoded = html.match(/(?:url=)?(%2FnextImages%2Falbums%2F[^&"']+)/i)?.[1];
  if (encoded) return new URL(decodeURIComponent(encoded), base).href;
  const direct = html.match(/(?:src|content)=["']([^"']*\/nextImages\/albums\/[^"']+)["']/i)?.[1];
  return direct ? new URL(htmlDecode(direct), base).href : "";
};

export const parseJoshWoodwardSong = (html, pageUrl) => {
  const metadata = jsonLdFrom(html);
  const clip = primaryMp3From(html);
  if (!metadata || !clip) return null;
  const licenseUrl = String(metadata.license || "").replace(/\/+$/, "/");
  if (licenseUrl !== CATALOG.licenseUrl) return null;
  const lyrics = String(metadata.recordingOf?.lyrics?.text || "").replaceAll("\r\n", "\n").trim();
  if (!lyrics) return null;
  return {
    externalId: `${CATALOG.id}:${new URL(pageUrl).pathname.split("/").filter(Boolean).at(-1)}`,
    title: String(metadata.name || "").trim(), artist: CATALOG.artist,
    album: String(metadata.inAlbum?.name || "").trim(), lyrics,
    pageUrl, audioUrl: new URL(clip.url, CATALOG.origin).href,
    artworkUrl: artworkFrom(html, pageUrl), declaredBytes: Number(clip.bytes) || null,
    licenseCode: CATALOG.licenseCode, licenseUrl: CATALOG.licenseUrl
  };
};

const songUrls = async () => {
  const xml = await (await fetchRetry(CATALOG.sitemap)).text();
  return [...xml.matchAll(/<loc>(https:\/\/www\.joshwoodward\.com\/song\/[^<]+)<\/loc>/g)]
    .map((match) => htmlDecode(match[1]));
};

const durationOf = (target) => {
  try {
    return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", target],
      { encoding: "utf8", timeout: 20_000 }).trim()) || null;
  } catch { return null; }
};

const lyricLines = (text, duration) => {
  const rows = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const weights = rows.map((line) => Math.max(2, line.split(/\s+/).length));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  const usable = Math.max(1, Number(duration) || rows.length * 4) * 0.94;
  let elapsed = Math.max(0, (Number(duration) || 0) * 0.02);
  return rows.map((text, index) => {
    const line = { time: Number(elapsed.toFixed(3)), text };
    elapsed += usable * (weights[index] / total);
    return line;
  });
};

const atomicJson = (target, value) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
};

const download = async (url, target) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.part`;
  const response = await fetchRetry(url);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary, { flags: "w" }));
  if (!fs.statSync(temporary).size) throw new Error(`Empty download from ${url}`);
  fs.renameSync(temporary, target);
};

const cacheArtwork = async (trackId, url) => {
  if (!url || repositories.artwork.findForTrack(trackId)) return;
  const id = createId("artwork");
  const directory = path.join(config.artworkDir, id);
  const target = path.join(directory, "cover.jpg");
  try {
    await download(url, target);
    const bytes = fs.readFileSync(target);
    if (bytes.length > 5 * 1024 * 1024) throw new Error("Artwork is too large");
    repositories.artwork.upsert({ id, trackId, remoteUrl: url, relativePath: relative(target), mimeType: "image/jpeg",
      sizeBytes: bytes.length, checksum: digest(bytes) });
  } catch {
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

const persist = async (song, html) => {
  const existing = repositories.tracks.findByExternalId("open-catalog", song.externalId);
  const existingMedia = existing && repositories.media.findReadyForTrack(existing.id);
  const existingLicense = existing && repositories.licenses.findForTrack(existing.id);
  if (existingMedia && existingLicense && fs.existsSync(path.resolve(config.dataDir, existingMedia.relative_path))) return "skipped";

  const track = repositories.tracks.upsert({ source: "open-catalog", externalId: song.externalId,
    sourceUrl: song.pageUrl, title: song.title, artist: song.artist, album: song.album,
    durationSeconds: existing?.duration_seconds || null, artworkUrl: song.artworkUrl });

  const mediaId = existingMedia?.id || createId("media");
  const mediaDirectory = path.join(config.storageDir, mediaId);
  const audioTarget = path.join(mediaDirectory, "audio.mp3");
  if (!fs.existsSync(audioTarget)) await download(song.audioUrl, audioTarget);
  const stat = fs.statSync(audioTarget);
  if (song.declaredBytes && Math.abs(stat.size - song.declaredBytes) > 1024) throw new Error("Downloaded MP3 does not match the publisher metadata");
  const duration = durationOf(audioTarget);
  repositories.tracks.upsert({ source: "open-catalog", externalId: song.externalId, sourceUrl: song.pageUrl,
    title: song.title, artist: song.artist, album: song.album, durationSeconds: duration, artworkUrl: song.artworkUrl });
  repositories.media.upsert({ id: mediaId, trackId: track.id, provider: "open-catalog", providerMediaId: song.externalId,
    kind: "audio", relativePath: relative(audioTarget), mimeType: "audio/mpeg", sizeBytes: stat.size,
    durationSeconds: duration, checksum: digest(fs.readFileSync(audioTarget)), status: "ready", lastVerifiedAt: new Date().toISOString() });
  atomicJson(path.join(mediaDirectory, "metadata.json"), { ...song, lyrics: undefined, trackId: track.id, mediaId, duration });

  const lines = lyricLines(song.lyrics, duration);
  const contentHash = digest(JSON.stringify(lines));
  let lyrics = repositories.lyrics.findForTrack(track.id).find((row) => row.content_hash === contentHash);
  if (!lyrics) {
    const id = createId("lyrics");
    const lyricsTarget = path.join(config.lyricsDir, id, "original.json");
    atomicJson(lyricsTarget, lines);
    lyrics = repositories.lyrics.upsert({ id, trackId: track.id, source: "open-catalog", externalId: song.externalId,
      language: "en", contentHash, relativePath: relative(lyricsTarget) });
  }
  repositories.search.indexLyrics({ trackId: track.id, lyricsId: lyrics.id, title: song.title, artist: song.artist,
    album: song.album, lyrics: lines.map((line) => line.text).join("\n") });

  const licenseId = existingLicense?.id || createId("license");
  const evidenceTarget = path.join(config.dataDir, "licenses", licenseId, "evidence.json");
  const evidence = { publisher: CATALOG.artist, pageUrl: song.pageUrl, audioUrl: song.audioUrl,
    title: song.title, album: song.album, licenseCode: song.licenseCode, licenseUrl: song.licenseUrl,
    pageSha256: digest(html), audioSha256: digest(fs.readFileSync(audioTarget)), checkedAt: new Date().toISOString() };
  atomicJson(evidenceTarget, evidence);
  repositories.licenses.upsert({ id: licenseId, trackId: track.id, licenseCode: song.licenseCode,
    licenseUrl: song.licenseUrl, rightsHolder: CATALOG.artist,
    attributionText: `${song.title} by ${CATALOG.artist} — ${song.licenseCode}`,
    evidenceUrl: song.pageUrl, evidenceHash: digest(JSON.stringify(evidence)), evidenceRelativePath: relative(evidenceTarget),
    coversRecording: true, coversComposition: true, coversLyrics: true, verifiedAt: evidence.checkedAt });
  await cacheArtwork(track.id, song.artworkUrl);
  repositories.lyricTranslationJobs.schedule({ trackId: track.id, targetLanguage: "fa" });
  return "imported";
};

const parseArgs = () => {
  const limitArg = process.argv.find((value) => value.startsWith("--limit="));
  const concurrencyArg = process.argv.find((value) => value.startsWith("--concurrency="));
  return { limit: limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 1) : Infinity,
    concurrency: concurrencyArg ? Math.min(5, Math.max(1, Number(concurrencyArg.split("=")[1]) || 2)) : 2,
    dryRun: process.argv.includes("--dry-run") };
};

const main = async () => {
  const options = parseArgs();
  const urls = (await songUrls()).slice(0, options.limit);
  const counters = { discovered: urls.length, eligible: 0, imported: 0, skipped: 0, failed: 0 };
  process.stdout.write(`Open catalog: ${urls.length} Josh Woodward song pages discovered.\n`);
  let cursor = 0;
  const worker = async () => {
    while (cursor < urls.length) {
      const index = cursor++; const pageUrl = urls[index];
      try {
        const html = await (await fetchRetry(pageUrl)).text();
        const song = parseJoshWoodwardSong(html, pageUrl);
        if (!song) { process.stdout.write(`[${index + 1}/${urls.length}] not eligible: ${pageUrl}\n`); continue; }
        counters.eligible += 1;
        const result = options.dryRun ? "skipped" : await persist(song, html);
        counters[result] += 1;
        process.stdout.write(`[${index + 1}/${urls.length}] ${result}: ${song.artist} — ${song.title}\n`);
      } catch (error) {
        counters.failed += 1;
        process.stderr.write(`[${index + 1}/${urls.length}] failed: ${pageUrl}: ${error.message}\n`);
      }
    }
  };
  await Promise.all(Array.from({ length: options.concurrency }, worker));
  process.stdout.write(`${JSON.stringify(counters)}\n`);
  if (counters.failed) process.exitCode = 2;
};

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) await main();
