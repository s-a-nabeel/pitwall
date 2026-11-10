// util.js: dates, formatting, escaping. No DOM state, no storage.

export const DAY_ROLLOVER_HOUR = 4; // study at 01:30 still counts for "yesterday's" day

const pad = (n) => String(n).padStart(2, "0");

/** Local day key 'YYYY-MM-DD' with a 04:00 rollover. */
export function dayKey(d = new Date()) {
  const t = new Date(d.getTime() - DAY_ROLLOVER_HOUR * 3600e3);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

function keyToUTC(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(key, n) {
  const t = new Date(keyToUTC(key) + n * 86400e3);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days from a to b (b - a). */
export function daysBetween(a, b) {
  return Math.round((keyToUTC(b) - keyToUTC(a)) / 86400e3);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(key) {
  return new Date(keyToUTC(key)).getUTCDay();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function fmtDay(key, withWeekday = false) {
  const [, m, d] = key.split("-").map(Number);
  const s = `${d} ${MONTHS[m - 1]}`;
  return withWeekday ? `${DAYS[weekday(key)]} ${s}` : s;
}
export const weekdayName = (i) => DAYS[i];

/** 1.25 → "1h 15m", 0.5 → "30m" */
export function fmtHM(hours) {
  const mins = Math.round(Math.abs(hours) * 60);
  const h = Math.floor(mins / 60), m = mins % 60;
  const s = h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
  return hours < 0 ? "−" + s : s;
}
/** 1.25 → "1.3h" */
export function fmtH(hours, digits = 1) {
  if (!isFinite(hours)) return "∞";
  return (hours < 0 ? "−" : "") + Math.abs(hours).toFixed(digits) + "h";
}
export function fmtSigned(hours) {
  if (!isFinite(hours)) return "−∞";
  return (hours >= 0 ? "+" : "−") + Math.abs(hours).toFixed(1) + "h";
}

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const round5 = (mins) => Math.round(mins / 5) * 5;

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function uid(prefix = "id") {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}
