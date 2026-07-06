// Deep-Luxe iOS-wheel language picker.
//
// The hidden #sourceLanguage/#targetLanguage <select>s remain the single source of truth. The
// picker only READS and WRITES them via dispatchEvent('change'), so every existing app.js listener
// (syncTargetWithSource, updateDirectionLabel, resetConversation) fires unchanged. No layout or
// interaction-model change — this is purely a richer control over the same state.

import { languages } from "./constants.js";
import { t } from "./i18n.js";

// Geometry — MUST stay in lockstep with langpicker.css (§2).
const ITEM_H = 40; // px per row
const WHEEL_H = 200; // visible wheel height (5 rows)

const reducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const escapeText = (value) => {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
};

export function initLangPicker(elements) {
  const overlay = document.querySelector("#langPicker");
  const trigger = elements.langPickerTrigger;
  if (!overlay || !trigger) return;

  const sheet = overlay.querySelector(".lp-sheet");
  const band = overlay.querySelector(".lp-band");
  const wheelSource = overlay.querySelector("#lpWheelSource");
  const wheelTarget = overlay.querySelector("#lpWheelTarget");
  const doneBtn = overlay.querySelector("#lpDone");
  const swapBtn = overlay.querySelector("#lpSwap");

  // Same array ui.js/buildLangOptions uses — source includes auto, target excludes it. This keeps
  // wheel index ↔ <option> index in perfect parity.
  const sourceList = languages;
  const targetList = languages.filter((lang) => lang.code !== "auto");

  const langName = (lang) => (lang.code === "auto" ? t("autoDetect") : lang.native);

  // ---- build ----

  const buildWheel = (wheelEl, list) => {
    const ul = wheelEl.querySelector(".lp-list");
    ul.innerHTML = "";
    wheelEl._codes = list.map((lang) => lang.code);
    for (const lang of list) {
      const li = document.createElement("li");
      li.className = "lp-item";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.dataset.code = lang.code;
      li.innerHTML =
        `<span class="lp-flag" aria-hidden="true">${lang.flag}</span>` +
        `<span class="lp-name">${escapeText(langName(lang))}</span>`;
      ul.appendChild(li);
    }
  };

  // ---- 3D cylinder curve (rAF-throttled) ----

  const applyCurve = (wheelEl) => {
    const reduce = reducedMotion();
    const center = wheelEl.scrollTop + WHEEL_H / 2;
    const items = wheelEl.querySelectorAll(".lp-item");
    items.forEach((item) => {
      const d = item.offsetTop + ITEM_H / 2 - center;
      const r = d / ITEM_H; // signed rows from center
      const ar = Math.min(Math.abs(r), 4);
      if (reduce) {
        // Reduced-motion: opacity falloff only, no 3D transform.
        item.style.transform = "";
        item.style.opacity = String(Math.max(1 - ar * 0.34, 0.2));
      } else {
        const rotateX = Math.max(-72, Math.min(72, -r * 20));
        const z = -ar * 12;
        const s = 1 - ar * 0.06;
        const o = Math.max(1 - ar * 0.26, 0.18);
        item.style.transform = `translateZ(${z}px) rotateX(${rotateX}deg) scale(${s})`;
        item.style.opacity = String(o);
      }
    });
  };

  const scheduleCurve = (wheelEl) => {
    if (wheelEl._raf) cancelAnimationFrame(wheelEl._raf);
    wheelEl._raf = requestAnimationFrame(() => {
      wheelEl._raf = null;
      applyCurve(wheelEl);
    });
  };

  // ---- selection bookkeeping ----

  const markSelected = (wheelEl, idx) => {
    const items = wheelEl.querySelectorAll(".lp-item");
    items.forEach((item, i) => item.setAttribute("aria-selected", i === idx ? "true" : "false"));
  };

  const scrollToCode = (wheelEl, code, smooth) => {
    if (!wheelEl._codes) return;
    const idx = Math.max(0, wheelEl._codes.indexOf(code));
    wheelEl._idx = idx;
    wheelEl._liveIdx = idx;
    markSelected(wheelEl, idx);
    // Already centered on this row → skip the scroll so a redundant behavior:'auto' re-sync can't
    // clobber an in-flight smooth scroll (e.g. from keyboard navigation).
    if (Math.round(wheelEl.scrollTop / ITEM_H) === idx) {
      requestAnimationFrame(() => applyCurve(wheelEl));
      return;
    }
    wheelEl.scrollTo({
      top: idx * ITEM_H,
      behavior: smooth && !reducedMotion() ? "smooth" : "auto"
    });
    requestAnimationFrame(() => applyCurve(wheelEl));
  };

  const syncWheelsFromSelects = () => {
    scrollToCode(wheelSource, elements.sourceLanguage.value, false);
    scrollToCode(wheelTarget, elements.targetLanguage.value, false);
  };

  // Write a chosen index back to the hidden <select>. commit() always re-syncs afterwards because a
  // source change can force the target off its old value (syncTargetWithSource) — without the
  // re-sync the target wheel would silently desync from its select.
  const commit = (wheelEl, selectEl, idx) => {
    const code = wheelEl._codes[idx];
    wheelEl._idx = idx;
    wheelEl._liveIdx = idx;
    markSelected(wheelEl, idx);
    if (selectEl.value !== code) {
      selectEl.value = code;
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
    syncWheelsFromSelects();
  };

  const idxFromScroll = (wheelEl) => {
    const count = wheelEl._codes.length;
    return Math.max(0, Math.min(Math.round(wheelEl.scrollTop / ITEM_H), count - 1));
  };

  const settle = (wheelEl, selectEl) => {
    const idx = idxFromScroll(wheelEl);
    if (idx !== wheelEl._idx) commit(wheelEl, selectEl, idx);
  };

  // Detent tick while dragging: haptic + a brief band pop as each row crosses center.
  const liveTick = (wheelEl) => {
    const liveIdx = Math.round(wheelEl.scrollTop / ITEM_H);
    if (liveIdx === wheelEl._liveIdx) return;
    wheelEl._liveIdx = liveIdx;
    if (reducedMotion()) return;
    if (typeof navigator.vibrate === "function") navigator.vibrate(6);
    band.classList.add("lp-band--tick");
    clearTimeout(band._tickT);
    band._tickT = setTimeout(() => band.classList.remove("lp-band--tick"), 90);
  };

  // ---- keyboard a11y (role=listbox) ----

  const onWheelKey = (event, wheelEl, selectEl) => {
    const count = wheelEl._codes.length;
    let idx = wheelEl._idx ?? 0;
    switch (event.key) {
      case "ArrowDown":
        idx = Math.min(idx + 1, count - 1);
        break;
      case "ArrowUp":
        idx = Math.max(idx - 1, 0);
        break;
      case "Home":
        idx = 0;
        break;
      case "End":
        idx = count - 1;
        break;
      case "Enter":
        event.preventDefault();
        close();
        return;
      default:
        return;
    }
    event.preventDefault();
    scrollToCode(wheelEl, wheelEl._codes[idx], true);
    commit(wheelEl, selectEl, idx);
  };

  const bindWheel = (wheelEl, selectEl) => {
    let debounce;
    wheelEl.addEventListener(
      "scroll",
      () => {
        scheduleCurve(wheelEl);
        liveTick(wheelEl);
        clearTimeout(debounce);
        debounce = setTimeout(() => settle(wheelEl, selectEl), 150);
      },
      { passive: true }
    );
    if ("onscrollend" in wheelEl) {
      wheelEl.addEventListener("scrollend", () => settle(wheelEl, selectEl));
    }
    wheelEl.addEventListener("keydown", (event) => onWheelKey(event, wheelEl, selectEl));
  };

  // ---- open / close ----

  const open = () => {
    // Rebuild so the auto-detect row picks up the current interface language.
    buildWheel(wheelSource, sourceList);
    buildWheel(wheelTarget, targetList);
    overlay.removeAttribute("inert");
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    trigger.setAttribute("aria-expanded", "true");
    syncWheelsFromSelects();
    requestAnimationFrame(() => {
      applyCurve(wheelSource);
      applyCurve(wheelTarget);
      // preventScroll: focusing a just-scrolled container must not scroll the page / interrupt
      // the sheet's slide-up on mobile.
      wheelSource.focus({ preventScroll: true });
    });
  };

  const close = () => {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    // inert removes the off-screen wheels/buttons from the tab order AND the a11y tree while closed.
    overlay.setAttribute("inert", "");
    if (wheelSource._raf) cancelAnimationFrame(wheelSource._raf);
    if (wheelTarget._raf) cancelAnimationFrame(wheelTarget._raf);
    clearTimeout(band._tickT);
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus();
  };

  // ---- focus trap within the sheet ----

  const trapTab = (event) => {
    if (event.key !== "Tab") return;
    const focusables = Array.from(
      sheet.querySelectorAll('button, [tabindex="0"]')
    ).filter((el) => !el.disabled && el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // ---- wiring ----

  // Starts closed → inert so its wheels/buttons are out of the tab order until opened.
  overlay.setAttribute("inert", "");

  buildWheel(wheelSource, sourceList);
  buildWheel(wheelTarget, targetList);
  bindWheel(wheelSource, elements.sourceLanguage);
  bindWheel(wheelTarget, elements.targetLanguage);

  trigger.addEventListener("click", open);
  doneBtn.addEventListener("click", close);

  swapBtn.addEventListener("click", () => {
    if (!reducedMotion()) {
      swapBtn.classList.add("spin");
      setTimeout(() => swapBtn.classList.remove("spin"), 300);
    }
    // Reuse the existing swapLanguages() + resetConversation() path via the hidden button.
    elements.swapButton.click();
    scrollToCode(wheelSource, elements.sourceLanguage.value, true);
    scrollToCode(wheelTarget, elements.targetLanguage.value, true);
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    trapTab(event);
  });

  // Keep the wheels honest when the selects change elsewhere (Settings sheet, swap, initial
  // populate). scrollToCode sets _idx up front, so these instant scrolls never re-trigger commit.
  elements.sourceLanguage.addEventListener("change", syncWheelsFromSelects);
  elements.targetLanguage.addEventListener("change", syncWheelsFromSelects);

  return { open, close };
}
