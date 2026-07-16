const request = async (url, options = {}) => {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("Couldn’t connect. Check your internet and try again.");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const fallback = response.status >= 500
      ? "Something went wrong on the server. Try again."
      : response.status === 404 ? "This item is no longer available." : "Couldn’t complete that action.";
    throw new Error(data.error || fallback);
  }

  return data;
};

export const getHealth = () => request("/api/health");

export const translate = (payload) => request("/api/translate", {
  method: "POST",
  body: JSON.stringify(payload)
});

// fetch() can't report upload progress, so transcription (which sends a large base64 audio
// body) uses XMLHttpRequest to surface xhr.upload progress events to the caller.
export const transcribeWithProgress = (payload, onUploadProgress) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/transcribe");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.responseType = "json";

    if (onUploadProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) onUploadProgress(event.loaded, event.total);
      });
    }

    xhr.addEventListener("load", () => {
      const data = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error(data.error || "Request failed"));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

    xhr.send(JSON.stringify(payload));
  });

export const getSettings = () => request("/api/settings");

export const updateSettings = (payload) => request("/api/settings", {
  method: "POST",
  body: JSON.stringify(payload)
});

export const testConnection = (payload) => request("/api/settings/test", {
  method: "POST",
  body: JSON.stringify(payload)
});

export const unlockOwner = (payload) => request("/api/auth/unlock", {
  method: "POST",
  body: JSON.stringify(payload)
});

export const logoutOwner = () => request("/api/auth/logout", { method: "POST" });

export const getMediaHealth = () => request("/api/media/health");

export const createMediaJob = (url) => request("/api/media/jobs", {
  method: "POST",
  body: JSON.stringify({ url })
});

export const createSearchMediaJob = (query, referenceUrl = "", signal) => request("/api/media/search-jobs", {
  method: "POST",
  body: JSON.stringify({ query, referenceUrl }),
  signal
});

export const getMediaJob = (id, signal) => request(`/api/media/jobs/${encodeURIComponent(id)}`, { signal });

export const deleteMedia = (id) => request(`/api/media/${encodeURIComponent(id)}`, { method: "DELETE" });

export const getSpotifyLyrics = (url, signal) => request("/api/media/lyrics", {
  method: "POST",
  body: JSON.stringify({ url }),
  signal
});

export const translateSpotifyLyrics = (payload, signal) => request("/api/media/lyrics/translate", {
  method: "POST",
  body: JSON.stringify(payload),
  signal
});

export const getLyricsTranslationStatus = (trackId, signal) => request(`/api/media/lyrics/translation/${encodeURIComponent(trackId)}`, { signal });

export const getLearnLibrary = () => request("/api/media/library");
export const discoverLearnArtists = (name) => request("/api/media/library/artists/discover", { method: "POST", body: JSON.stringify({ name }) });
export const createLearnArtist = (payload) => request("/api/media/library/artists", { method: "POST", body: JSON.stringify(payload) });
export const getLearnArtist = (id, signal) => request(`/api/media/library/artists/${encodeURIComponent(id)}`, { signal });
export const prepareLearnArtistTrack = (id) => request(`/api/media/library/artists/catalog/${encodeURIComponent(id)}/prepare`, { method: "POST" });
export const createLearnPlaylist = (payload) => request("/api/media/library/playlists", { method: "POST", body: JSON.stringify(payload) });
export const getLearnPlaylist = (id) => request(`/api/media/library/playlists/${encodeURIComponent(id)}`);
export const updateLearnPlaylist = (id, payload) => request(`/api/media/library/playlists/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
export const deleteLearnPlaylist = (id) => request(`/api/media/library/playlists/${encodeURIComponent(id)}`, { method: "DELETE" });
export const addTrackToLearnPlaylist = (id, payload) => request(`/api/media/library/playlists/${encodeURIComponent(id)}/tracks`, { method: "POST", body: JSON.stringify(payload) });
export const removeTrackFromLearnPlaylist = (id, trackId) => request(`/api/media/library/playlists/${encodeURIComponent(id)}/tracks/${encodeURIComponent(trackId)}`, { method: "DELETE" });
export const openLearnTrack = (id) => request(`/api/media/library/tracks/${encodeURIComponent(id)}/open`, { method: "POST" });
export const saveLearnProgress = (id, payload) => request(`/api/media/library/tracks/${encodeURIComponent(id)}/progress`, { method: "POST", body: JSON.stringify(payload) });
export const importSpotifyPlaylist = (url) => request("/api/media/spotify/import-playlist", { method: "POST", body: JSON.stringify({ url }) });
export const createLearnSearch = (query, signal) => request("/api/media/search", { method: "POST", body: JSON.stringify({ query }), signal });
export const getLearnSearch = (id, signal) => request(`/api/media/search/${encodeURIComponent(id)}`, { signal });
export const prepareLearnSearchResult = (id, signal) => request(`/api/media/search/results/${encodeURIComponent(id)}/prepare`, { method: "POST", signal });
