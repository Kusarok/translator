const request = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
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

export const getLearnLibrary = () => request("/api/media/library");
export const createLearnPlaylist = (payload) => request("/api/media/library/playlists", { method: "POST", body: JSON.stringify(payload) });
export const getLearnPlaylist = (id) => request(`/api/media/library/playlists/${encodeURIComponent(id)}`);
export const addTrackToLearnPlaylist = (id, payload) => request(`/api/media/library/playlists/${encodeURIComponent(id)}/tracks`, { method: "POST", body: JSON.stringify(payload) });
export const openLearnTrack = (id) => request(`/api/media/library/tracks/${encodeURIComponent(id)}/open`, { method: "POST" });
export const saveLearnProgress = (id, payload) => request(`/api/media/library/tracks/${encodeURIComponent(id)}/progress`, { method: "POST", body: JSON.stringify(payload) });
export const importSpotifyPlaylist = (url) => request("/api/media/spotify/import-playlist", { method: "POST", body: JSON.stringify({ url }) });
