const gate = document.getElementById("loginGate");
const shell = document.getElementById("appShell");
const form = document.getElementById("loginForm");
const btn = document.getElementById("loginBtn");
const errorEl = document.getElementById("loginError");

const showLogin = () => {
  if (gate) gate.hidden = false;
  if (shell) shell.hidden = true;
};

const showApp = () => {
  if (gate) gate.hidden = true;
  if (shell) shell.hidden = false;
};

const setLoading = (loading) => {
  if (btn) btn.disabled = loading;
  if (errorEl) errorEl.hidden = true;
};

const showError = (message) => {
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }
};

const handleLogin = async (event) => {
  event.preventDefault();
  setLoading(true);
  try {
    const username = document.getElementById("loginUsername").value;
    const password = document.getElementById("loginPassword").value;
    const response = await fetch("/api/auth/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.ok) {
      window.location.reload();
      return;
    }
    showError(data.error || "Incorrect username or password.");
  } catch {
    showError("Network error. Please try again.");
  } finally {
    setLoading(false);
  }
};

export const checkAuth = async () => {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    if (data.auth?.gateEnabled && !data.auth?.authenticated) {
      showLogin();
      form?.addEventListener("submit", handleLogin);
      return false;
    }
    showApp();
    return true;
  } catch {
    showApp();
    return true;
  }
};
