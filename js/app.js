// app.js: boot, router, global event delegation, recompute-on-every-change loop.
import * as store from "./store.js";
import { computePlan } from "./engine.js";
import { dayKey } from "./util.js";
import { actions, setGetter, sheetForm, sheetOpen, refreshSheet, ICONS } from "./ui/common.js";
import * as race from "./ui/race.js";
import * as sectors from "./ui/sectors.js";
import * as calendar from "./ui/calendar.js";
import * as telemetry from "./ui/telemetry.js";
import * as strategy from "./ui/strategy.js";
import * as onboarding from "./ui/onboarding.js";
import { checkReminder } from "./ui/notify.js";
import "./ui/log.js";
import "./ui/share.js";

const VIEWS = { race, sectors, calendar, telemetry, strategy };
const TABS = [["race", "Race"], ["sectors", "Sectors"], ["calendar", "Calendar"], ["telemetry", "Telemetry"], ["strategy", "Strategy"]];

let plan = null;
let renderedDay = dayKey();
setGetter(() => ({ state: store.getState(), plan }));

function route() {
  const [view, arg] = (location.hash.slice(1) || "race").split("/");
  return { view: VIEWS[view] ? view : "race", arg: arg ? decodeURIComponent(arg) : null };
}

function render() {
  const app = document.getElementById("app");
  const state = store.getState();
  const root = document.documentElement;
  if (!state) {
    root.dataset.flag = "green";
    app.innerHTML = onboarding.view();
    return;
  }
  const t0 = performance.now();
  renderedDay = dayKey();
  plan = computePlan(state, renderedDay);
  root.dataset.livery = state.settings.livery || "scarlet";
  root.dataset.flag = plan.flag;

  const { view, arg } = route();
  const v = VIEWS[view].view(state, plan, arg);
  const driver = state.settings.student.raceNumber || state.settings.student.name
    ? `<span class="driver">#${state.settings.student.raceNumber || "—"} ${(state.settings.student.name || "").toUpperCase()}</span>` : "";
  app.innerHTML = `
    <div class="flagbar" role="presentation"></div>
    <header class="topbar">
      <h1>${v.back ? `<a class="back" href="${v.back}" aria-label="Back">‹</a>` : ""}${v.title}</h1>
      ${v.right ?? driver}
    </header>
    <main>${v.html}</main>
    <div class="tabs"><nav>${TABS.map(([id, label]) =>
      `<a href="#${id}" class="${id === view ? "on" : ""}" aria-current="${id === view ? "page" : "false"}">${ICONS[id]}${label}</a>`).join("")}</nav></div>`;
  if (v.mount) v.mount(app);
  tickCountdowns();
  if (sheetOpen()) refreshSheet();
  const ms = performance.now() - t0;
  if (ms > 50) console.debug(`PitWall render ${view}: ${ms.toFixed(1)}ms`);
}

// ---------- event delegation ----------
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (!fn) return console.warn("no action", el.dataset.action);
  e.preventDefault();
  fn(el, e);
});
document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-change]");
  if (el && actions[el.dataset.change]) actions[el.dataset.change](el, e);
});
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.bind) {
    sheetForm[el.dataset.bind] = el.type === "number" || el.type === "range" ? (el.value === "" ? "" : Number(el.value)) : el.value;
  }
  if (el.dataset.out) {
    const out = document.getElementById(el.dataset.out);
    if (out) out.textContent = el.value + (el.dataset.unit || "");
  }
  if (el.dataset.input && actions[el.dataset.input]) actions[el.dataset.input](el, e);
});
document.addEventListener("submit", (e) => e.preventDefault());
document.addEventListener("keydown", (e) => {
  // keyboard users: Enter/Space on div[role=button] rows behaves like a click
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.('[role="button"][data-action]')) { e.preventDefault(); e.target.click(); }
});

window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
store.subscribe(render);

// ---------- clocks ----------
function tickCountdowns() {
  const now = Date.now();
  document.querySelectorAll("[data-countdown]").forEach((el) => {
    const ms = new Date(el.dataset.countdown).getTime() - now;
    if (ms <= 0) { el.textContent = "Lights out!"; return; }
    const d = Math.floor(ms / 86400e3), h = Math.floor((ms % 86400e3) / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
    el.textContent = `${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
  });
}
setInterval(() => {
  if (store.getState() && dayKey() !== renderedDay) render(); // day rolled over at 04:00
  tickCountdowns();
  checkReminder();
}, 30e3);
document.addEventListener("visibilitychange", () => { if (!document.hidden && store.getState()) { render(); checkReminder(); } });

// ---------- boot ----------
store.load();
render();
checkReminder();
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW failed", e));
}
