import youtube from "./youtube.js";
import x from "./x.js";
import instagram from "./instagram.js";
import facebook from "./facebook.js";
import spotify from "./spotify.js";
import tiktok from "./tiktok.js";

const definitions = [youtube, x, instagram, facebook, spotify, tiktok];

const matchesHost = (hostname, allowed) =>
  hostname === allowed || hostname.endsWith(`.${allowed}`);

export const resolvePlatform = (input) => {
  let url;
  try {
    url = new URL(String(input || "").trim());
  } catch {
    throw new Error("Enter a valid public media URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS media URLs are supported.");
  }
  if (url.username || url.password) {
    throw new Error("URLs containing credentials are not allowed.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const platform = definitions.find((entry) =>
    entry.hosts.some((allowed) => matchesHost(hostname, allowed))
  );
  if (!platform) {
    throw new Error("Supported platforms are YouTube, Facebook, X, Spotify, Instagram, and TikTok.");
  }
  return { ...platform, url: url.toString() };
};

export const platformCatalog = () => definitions.map(({ hosts, ...entry }) => entry);
