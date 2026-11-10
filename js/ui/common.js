// common.js: shared UI plumbing: action registry, bottom sheet, toast, small render helpers.
import { esc } from "../util.js";
import { STATUS_LABEL } from "../engine.js";

/** All clickable things use data-action="name"; modules register handlers here. */
export const actions = {};
export const register = (o) => Object.assign(actions, o);

// app.js injects these so views can read the latest state/plan without import cycles
let _get = () => ({ state: null, plan: null });
export const setGetter = (fn) => (_get = fn);
export const current = () => _get();

// ---------- sheet ----------
let sheetRender = null;
/** Form scratch-state for the open sheet; inputs with data-bind="key" write into it. */
export let sheetForm = {};

export function openSheet(renderFn, form = {}) {
  sheetRender = renderFn;
  sheetForm = form;
  refreshSheet();
  const root = document.getElementById("sheet-root");
  root.hidden = false;
  document.body.style.overflow = "hidden";
  const first = root.querySelector("[autofocus]");
  if (first) setTimeout(() => first.focus(), 50);
}
export function refreshSheet() {
  if (!sheetRender) return;
  const el = document.querySelector("#sheet-root .sheet");
  const scroll = el.scrollTop;
  el.innerHTML = sheetRender(sheetForm);
  el.scrollTop = scroll;
}
export function closeSheet() {
  sheetRender = null;
  document.getElementById("sheet-root").hidden = true;
  document.body.style.overflow = "";
}
export const sheetOpen = () => !!sheetRender;

register({ "sheet.close": () => closeSheet() });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetOpen()) closeSheet(); });

// ---------- toast ----------
let toastTimer;
export function toast(msg, ms = 2600) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

// ---------- helpers ----------
export const tyre = (compound) => `<span class="tyre ${esc(compound || "medium")}" title="${esc(compound || "medium")} tyre"></span>`;
export const FLAG_WORD = { green: "Green flag", yellow: "Yellow flag", red: "Red flag" };
export const flagWord = (flag) => `<span class="flagword ${flag}">${FLAG_WORD[flag]}</span>`;
export const statusTag = (ch) => {
  if (ch.kind === "skill") return `<span class="tag">practice</span>`;
  if (ch.status === "done") return `<span class="tag done">🏁 ${STATUS_LABEL.done}</span>`;
  return `<span class="tag">${STATUS_LABEL[ch.status || "garage"]}</span>`;
};
export const boardTag = (ch) =>
  ch.board === "partial" ? `<span class="tag partial">part</span>` :
  ch.board === "internal" ? `<span class="tag">internal</span>` :
  ch.board === false ? `<span class="tag">not in board</span>` : "";

export function ratioClass(r) {
  if (!isFinite(r) || r > 1.05) return "red";
  if (r > 0.9) return "yellow";
  return "green";
}
export const fmtRatio = (r) => (isFinite(r) ? r.toFixed(2) : "∞");

export function findChapter(state, chapterId) {
  for (const s of state.subjects) {
    const i = s.chapters.findIndex((c) => c.id === chapterId);
    if (i >= 0) return { subject: s, chapter: s.chapters[i], index: i };
  }
  return null;
}

export const ICONS = {
  race: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 13l4-4M9 2h6"/></svg>',
  sectors: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  telemetry: '<svg viewBox="0 0 24 24"><path d="M3 20h18M6 16v-5M11 16V7M16 16v-8M21 16v-3"/></svg>',
  strategy: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
};
