const PLAYLIST_URL = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/([A-Za-z0-9]{22})(?:[/?#]|$)/i;

export const parseSpotifyPlaylistUrl = (value) => {
  const clean = String(value || "").trim();
  const match = clean.match(PLAYLIST_URL);
  if (!match) throw new TypeError("A valid Spotify playlist link is required.");
  return { id: match[1], url: `https://open.spotify.com/playlist/${match[1]}` };
};

const spotifyJson = async (url, accessToken) => {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Spotify returned HTTP ${response.status}`);
  return data;
};

export const fetchSpotifyPlaylist = async ({ playlistId, accessToken, market }) => {
  if (!accessToken) throw new TypeError("Spotify account connection is required.");
  const query = new URLSearchParams({ fields: "id,name,description,external_urls,images,snapshot_id,owner(display_name),items(total)" });
  if (market) query.set("market", market);
  const playlist = await spotifyJson(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}?${query}`, accessToken);
  const tracks = [];
  let next = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items?limit=50${market ? `&market=${encodeURIComponent(market)}` : ""}`;
  while (next) {
    const page = await spotifyJson(next, accessToken);
    for (const item of page.items || []) {
      const track = item.track;
      if (!track || track.type !== "track" || !track.id) continue;
      tracks.push({
        spotifyId: track.id,
        sourceUrl: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
        title: track.name || "Unknown track",
        artist: (track.artists || []).map((artist) => artist.name).filter(Boolean).join(", "),
        album: track.album?.name || "",
        duration: Number(track.duration_ms || 0) / 1000,
        artwork: track.album?.images?.[0]?.url || "",
        position: tracks.length
      });
    }
    next = page.next;
  }
  return {
    spotifyId: playlist.id,
    name: playlist.name,
    description: playlist.description || "",
    sourceUrl: playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${playlist.id}`,
    artwork: playlist.images?.[0]?.url || "",
    snapshotId: playlist.snapshot_id,
    owner: playlist.owner?.display_name || "",
    tracks
  };
};
