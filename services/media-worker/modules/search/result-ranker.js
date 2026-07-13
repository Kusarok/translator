import { normalizeSearchText } from "./query-normalizer.js";

const tokens = (value) => new Set(normalizeSearchText(value).split(" ").filter((token) => token.length > 1));
const overlap = (left, right) => {
  const a = tokens(left), b = tokens(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return common / Math.min(a.size, b.size);
};

export const matchedLyricLine = (syncedLyrics, query) => {
  const wanted = normalizeSearchText(query);
  const words = wanted.split(" ").filter(Boolean);
  const lines = String(syncedLyrics || "").split(/\r?\n/).map((line) => line.replace(/\[[^\]]+\]/g, "").trim()).filter(Boolean);
  return lines.find((line) => normalizeSearchText(line).includes(wanted)) ||
    lines.find((line) => words.length > 1 && words.filter((word) => normalizeSearchText(line).includes(word)).length >= Math.ceil(words.length * .7)) || "";
};

export const rankCandidate = ({ candidate, audio, query }) => {
  const title = normalizeSearchText(candidate.trackName);
  const artist = normalizeSearchText(candidate.artistName);
  const wanted = normalizeSearchText(query);
  const lyricMatch = matchedLyricLine(candidate.syncedLyrics, query);
  const duration = Number(candidate.duration) || 0;
  const audioDuration = Number(audio.duration) || 0;
  if (!duration || !audioDuration || Math.abs(duration - audioDuration) > Math.max(8, duration * .04)) return null;
  const titleAudio = overlap(candidate.trackName, audio.title);
  const artistAudio = overlap(candidate.artistName, `${audio.title} ${audio.creator}`);
  if (titleAudio < .45 && artistAudio < .5) return null;
  let score = 30;
  if (title === wanted) score += 45;
  else if (title.includes(wanted) || wanted.includes(title)) score += 30;
  if (artist === wanted || artist.includes(wanted)) score += 25;
  if (lyricMatch) score += 40;
  score += Math.round(titleAudio * 20 + artistAudio * 10);
  score += Math.max(0, 15 - Math.abs(duration - audioDuration) * 2);
  if (/\b(live|cover|karaoke|remix)\b/i.test(audio.title) && !/\b(live|cover|remix)\b/i.test(candidate.trackName)) score -= 25;
  return { score, lyricMatch };
};

export const dedupeCandidates = (rows) => {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${normalizeSearchText(row.trackName)}|${normalizeSearchText(row.artistName)}|${Math.round(Number(row.duration || 0) / 3)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
};
