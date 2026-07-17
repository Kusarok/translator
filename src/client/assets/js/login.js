const gate = document.getElementById("loginGate");
const shell = document.getElementById("appShell");
const form = document.getElementById("loginForm");
const btn = document.getElementById("loginBtn");
const errorEl = document.getElementById("loginError");
const nameInput = document.getElementById("loginName");
const passwordInput = document.getElementById("loginPassword");
const googleButton = document.getElementById("googleLogin");
const closeButton = document.getElementById("loginClose");
const guestButton = document.getElementById("loginGuest");
let mode = "login";
let bound = false;

export const showLogin = () => { if (gate) gate.hidden = false; if (shell) shell.hidden = false; };
export const hideLogin = () => { if (gate) gate.hidden = true; };
const showApp = () => { if (gate) gate.hidden = true; if (shell) shell.hidden = false; };
const showError = (message) => { if (errorEl) { errorEl.textContent = message; errorEl.hidden = false; } };

const selectMode = (next) => {
  mode = next;
  document.querySelectorAll("[data-auth-mode]").forEach((item) => item.classList.toggle("active", item.dataset.authMode === mode));
  nameInput.hidden = mode !== "register";
  nameInput.required = mode === "register";
  document.getElementById("loginEmail").placeholder = mode === "register" ? "Email address" : "Email or owner username";
  passwordInput.autocomplete = mode === "register" ? "new-password" : "current-password";
  btn.textContent = mode === "register" ? "Create account" : "Sign in";
  errorEl.hidden = true;
};

const handleLogin = async (event) => {
  event.preventDefault();
  btn.disabled = true;
  errorEl.hidden = true;
  try {
    const payload = {
      email: document.getElementById("loginEmail").value,
      password: passwordInput.value,
      ...(mode === "register" ? { displayName: nameInput.value } : {})
    };
    const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not continue.");
    window.location.replace("/");
  } catch (error) { showError(error.message || "Network error. Please try again."); }
  finally { btn.disabled = false; }
};

const bind = () => {
  if (bound) return;
  bound = true;
  form?.addEventListener("submit", handleLogin);
  closeButton?.addEventListener("click", hideLogin);
  guestButton?.addEventListener("click", hideLogin);
  window.addEventListener("auth:required", showLogin);
  document.querySelectorAll("[data-auth-mode]").forEach((item) => item.addEventListener("click", () => selectMode(item.dataset.authMode)));
};

export const checkAuth = async () => {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    if (!data.auth?.authenticated) {
      googleButton.hidden = !data.auth?.googleEnabled;
      document.body.dataset.authenticated = "false";
      bind(); showApp(); return true;
    }
    document.body.dataset.authenticated = "true";
    showApp(); return true;
  } catch { bind(); showApp(); return true; }
};
