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
