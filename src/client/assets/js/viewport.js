const root = document.documentElement;
const visualViewport = window.visualViewport;

let rafId = 0;
let lastHeight = "";

const currentViewportHeight = () => {
  const height =
    visualViewport?.height ||
    window.innerHeight ||
    document.documentElement.clientHeight;

  return `${Math.max(1, Math.round(height))}px`;
};

const applyViewportHeight = () => {
  rafId = 0;

  const nextHeight = currentViewportHeight();
  if (nextHeight === lastHeight) return;

  lastHeight = nextHeight;
  root.style.setProperty("--app-height", nextHeight);
};

const scheduleViewportHeight = () => {
  if (rafId) return;
  rafId = window.requestAnimationFrame(applyViewportHeight);
};

export const initViewportSizing = () => {
  applyViewportHeight();

  window.addEventListener("resize", scheduleViewportHeight, { passive: true });
  window.addEventListener("pageshow", scheduleViewportHeight, { passive: true });
  window.addEventListener("orientationchange", () => {
    scheduleViewportHeight();
    window.setTimeout(scheduleViewportHeight, 250);
  }, { passive: true });

  if (visualViewport) {
    visualViewport.addEventListener("resize", scheduleViewportHeight, { passive: true });
    visualViewport.addEventListener("scroll", scheduleViewportHeight, { passive: true });
  }
};
