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
