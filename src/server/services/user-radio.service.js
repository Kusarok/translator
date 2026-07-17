import net from "node:net";

const privateIpv4 = (host) => {
  const parts = host.split(".").map(Number);
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
};

export const normalizeUserStation = (payload) => {
  const name = String(payload?.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) throw new TypeError("Enter a station name.");
  let url;
  try { url = new URL(String(payload?.streamUrl || "").trim()); }
  catch { throw new TypeError("Enter a valid stream URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.href.length > 2048) {
    throw new TypeError("Use a secure HTTPS stream URL.");
  }
  const host = url.hostname.toLowerCase();
  const ipKind = net.isIP(host);
  if (host === "localhost" || host.endsWith(".local") || (ipKind === 4 && privateIpv4(host)) ||
      (ipKind === 6 && (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")))) {
    throw new TypeError("Local network stream URLs are not allowed.");
  }
  url.hash = "";
  return { name, streamUrl: url.href };
};
