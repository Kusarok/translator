const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SOCIAL_ID = /^[A-Za-z0-9_-]{5,64}$/;
const NUMERIC_ID = /^\d{5,25}$/;

const fail = (code) => {
  const error = new Error(code);
  error.code = code;
  throw error;
};

const parseUrl = (input) => {
  let url;
  try {
    url = new URL(String(input || "").trim());
  } catch {
    fail("mediaInvalidUrl");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) {
    fail("mediaInvalidUrl");
  }
  url.protocol = "https:";
  url.hash = "";
  return url;
};

const youtube = (url) => {
  const host = url.hostname.toLowerCase();
  let id = "";
  if (host === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] || "";
  } else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
    const parts = url.pathname.split("/").filter(Boolean);
    id = parts[0] === "watch" ? url.searchParams.get("v") || "" :
      ["shorts", "live", "embed"].includes(parts[0]) ? parts[1] || "" : "";
  } else if (["youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
    const parts = url.pathname.split("/").filter(Boolean);
    id = parts[0] === "embed" ? parts[1] || "" : "";
  } else {
    return null;
  }
  if (!YOUTUBE_ID.test(id)) fail("mediaUnsupportedContent");
  return {
    platform: "youtube",
    label: "YouTube",
    sourceUrl: `https://www.youtube.com/watch?v=${id}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0`,
    layout: "landscape",
    allow: "autoplay; encrypted-media; picture-in-picture; web-share"
  };
};

const spotify = (url) => {
  if (url.hostname.toLowerCase() !== "open.spotify.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0]?.startsWith("intl-")) parts.shift();
  const [type, id] = parts;
  if (!["track", "album", "playlist", "artist", "show", "episode"].includes(type) || !SPOTIFY_ID.test(id || "")) {
    fail("mediaUnsupportedContent");
  }
  const canonical = `https://open.spotify.com/${type}/${id}`;
  return {
    platform: "spotify",
    label: "Spotify",
    sourceUrl: canonical,
    embedUrl: `https://open.spotify.com/embed/${type}/${id}`,
    layout: type === "track" ? "spotify-compact" : "spotify",
    allow: "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
  };
};

const instagram = (url) => {
  if (!["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (!["p", "reel"].includes(parts[0]) || !SOCIAL_ID.test(parts[1] || "")) {
    fail("mediaUnsupportedContent");
  }
  const canonical = `https://www.instagram.com/${parts[0]}/${parts[1]}/`;
  return {
    platform: "instagram",
    label: "Instagram",
    sourceUrl: canonical,
    embedUrl: `${canonical}embed/`,
    layout: "post",
    allow: "encrypted-media; picture-in-picture"
  };
};

const tiktok = (url) => {
  if (!["tiktok.com", "www.tiktok.com", "m.tiktok.com"].includes(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const videoIndex = parts.indexOf("video");
  const id = videoIndex > 0 ? parts[videoIndex + 1] || "" : "";
  if (!NUMERIC_ID.test(id)) fail("mediaUnsupportedContent");
  return {
    platform: "tiktok",
    label: "TikTok",
    sourceUrl: `https://www.tiktok.com/${parts[0]}/video/${id}`,
    embedUrl: `https://www.tiktok.com/player/v1/${id}?autoplay=0`,
    layout: "portrait",
    allow: "encrypted-media; picture-in-picture; fullscreen"
  };
};

const xPost = (url) => {
  if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"].includes(url.hostname.toLowerCase())) {
    return null;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[1] !== "status" || !NUMERIC_ID.test(parts[2] || "")) fail("mediaUnsupportedContent");
  return {
    platform: "x",
    label: "X",
    sourceUrl: `https://x.com/${parts[0]}/status/${parts[2]}`,
    embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${parts[2]}`,
    layout: "post",
    allow: "encrypted-media; picture-in-picture"
  };
};

const facebook = (url) => {
  const host = url.hostname.toLowerCase();
  if (!["facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch"].includes(host)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const isShort = host === "fb.watch" && SOCIAL_ID.test(parts[0] || "");
  const id = url.searchParams.get("v") ||
    (parts[0] === "reel" ? parts[1] : "") ||
    (parts.includes("videos") ? parts[parts.indexOf("videos") + 1] : "");
  if (!isShort && !NUMERIC_ID.test(id || "")) fail("mediaUnsupportedContent");
  const canonical = isShort
    ? `https://fb.watch/${parts[0]}/`
    : url.searchParams.has("v")
      ? `https://www.facebook.com/watch/?v=${id}`
      : parts[0] === "reel"
        ? `https://www.facebook.com/reel/${id}`
        : `https://www.facebook.com/${parts[0]}/videos/${id}`;
  return {
    platform: "facebook",
    label: "Facebook",
    sourceUrl: canonical,
    embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(canonical)}&show_text=false&width=560`,
    layout: "landscape",
    allow: "autoplay; encrypted-media; picture-in-picture"
  };
};

export const buildMediaEmbed = (input) => {
  const url = parseUrl(input);
  const result = spotify(url);
  if (!result) fail("mediaUnsupportedUrl");
  if (!result.sourceUrl.includes("/track/")) fail("mediaUnsupportedContent");
  return result;
};
