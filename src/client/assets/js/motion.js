const REVEAL_SELECTOR = [
  ".learn-section",
  ".learn-quick-tile",
  ".learn-continue-card",
  ".learn-track-row",
  ".learn-artist-card",
  ".learn-playlist-card",
  ".learn-search-result",
  ".learn-search-artist-banner",
  ".media-status-card"
].join(",");

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const ripple = (event) => {
  if (reducedMotion() || event.button > 0) return;
  const target = event.target.closest("button, a[role='button'], .motion-interactive");
  if (!target || target.disabled || target.getAttribute("aria-disabled") === "true") return;
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const size = Math.max(rect.width, rect.height) * 1.8;
  const wave = document.createElement("span");
  wave.className = "motion-ripple";
  wave.setAttribute("aria-hidden", "true");
  wave.style.width = wave.style.height = `${size}px`;
  wave.style.left = `${event.clientX - rect.left - size / 2}px`;
  wave.style.top = `${event.clientY - rect.top - size / 2}px`;
  target.classList.add("has-motion-ripple");
  target.querySelectorAll(":scope > .motion-ripple").forEach((item) => item.remove());
  target.append(wave);
  wave.addEventListener("animationend", () => wave.remove(), { once: true });
};

export const initMotion = () => {
  if (document.documentElement.dataset.motionReady === "true") return;
  document.documentElement.dataset.motionReady = "true";
  document.addEventListener("pointerdown", ripple, { passive: true });
  if (reducedMotion() || !("IntersectionObserver" in window)) return;

  document.documentElement.classList.add("motion-enabled");
  let order = 0;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-revealed");
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });

  const observe = (root) => {
    const items = [];
    if (root.nodeType === Node.ELEMENT_NODE && root.matches(REVEAL_SELECTOR)) items.push(root);
    root.querySelectorAll?.(REVEAL_SELECTOR).forEach((item) => items.push(item));
    for (const item of items) {
      if (item.classList.contains("motion-reveal") || item.hidden) continue;
      item.classList.add("motion-reveal");
      item.style.setProperty("--motion-order", String(order++ % 7));
      observer.observe(item);
    }
  };

  observe(document);
  const mutations = new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) observe(node);
    });
  });
  mutations.observe(document.body, { childList: true, subtree: true });
};
