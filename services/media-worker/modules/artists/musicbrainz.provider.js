const USER_AGENT = "Translator/1.0 (https://server.raminexch.store)";
let nextRequestAt = 0;
let requestTail = Promise.resolve();

const reserveRequestSlot = () => {
  const turn = requestTail.then(async () => {
    const wait = Math.max(0, nextRequestAt - Date.now());
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    nextRequestAt = Date.now() + 1100;
  });
  requestTail = turn.catch(() => {});
  return turn;
};

const request = async (pathname) => {
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await reserveRequestSlot();
    try {
      response = await fetch(`https://musicbrainz.org/ws/2/${pathname}`, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(25000)
      });
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
      continue;
    }
    if (![429, 503].includes(response.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
  }
  if (!response.ok) throw new Error(`MusicBrainz returned HTTP ${response.status}.`);
  return response.json();
};

const lucene = (value) => String(value || "").replace(/([+\-&|!(){}\[\]^"~*?:\\/])/g, "\\$1");

export const searchMusicBrainzArtists = async (name) => {
  const data = await request(`artist?query=${encodeURIComponent(`artist:"${lucene(name)}"`)}&fmt=json&limit=8`);
  return (data.artists || []).map((artist) => ({
    musicbrainzId: artist.id, name: artist.name, sortName: artist["sort-name"] || artist.name,
    country: artist.country || artist.area?.name || "", disambiguation: artist.disambiguation || "",
    type: artist.type || "", score: Number(artist.score || 0)
  }));
};

export const browseArtistRecordings = async (musicbrainzId, onPage) => {
  const recordings = [];
  let offset = 0, total = 1;
  while (offset < total) {
    const data = await request(`recording?artist=${encodeURIComponent(musicbrainzId)}&fmt=json&limit=100&offset=${offset}`);
    const page = data.recordings || [];
    total = Number(data["recording-count"] || page.length);
    recordings.push(...page.map((item) => ({ id: item.id, title: item.title, duration: item.length ? Number(item.length) / 1000 : null })));
    offset += page.length;
    onPage?.({ loaded: recordings.length, total });
    if (!page.length) break;
  }
  return recordings;
};
