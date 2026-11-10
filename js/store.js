// store.js: the ONLY module that reads or writes LocalStorage.
// Stored: settings, subjects/chapters (incl. status), logs, overrides, internal checklist.
// Never stored: anything the engine can derive.

import { SEED } from "./seed-syllabus.js";
import { COMPOUND_HOURS, SKILL_HOURS, LIT_HOURS, LANGUAGE_SUBJECTS, STATUSES } from "./engine.js";
import { dayKey, uid } from "./util.js";

export const SCHEMA_VERSION = 1;
const KEY = "pitwall.v1";
const TIMER_KEY = "pitwall.timer";

const listeners = new Set();
let state = null;

export const getState = () => state;
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }
function safeDel(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

export function load() {
  const raw = safeGet(KEY);
  if (!raw) return (state = null);
  try { state = migrate(JSON.parse(raw)); } catch (e) { console.error("PitWall: bad saved data", e); state = null; }
  return state;
}

function persist() {
  if (!safeSet(KEY, JSON.stringify(state))) console.warn("PitWall: could not save (storage blocked or full)");
  listeners.forEach((fn) => fn(state));
}

/** Mutate state through a function, then save and notify. */
export function update(fn) {
  const next = structuredClone(state);
  fn(next);
  state = next;
  persist();
}

export function defaultSettings() {
  return {
    student: { name: "", raceNumber: "" },
    hours: { weekday: 3, saturday: 6, sunday: 6, perWeekday: {} },
    revisionBufferDays: 21,
    revisionPasses: 2,
    weakBoost: true,
    livery: "scarlet",
    reminderTime: "20:00",
    notify: false,
  };
}

export function defaultHours(subjectId, ch) {
  const table = ch.kind === "skill" ? SKILL_HOURS : LANGUAGE_SUBJECTS.includes(subjectId) ? LIT_HOURS : COMPOUND_HOURS;
  return table[ch.compound] ?? 4;
}

export function seedSubjects() {
  return SEED.subjects.map((s) => ({
    id: s.id, name: s.name, code: s.code, exam: s.exam, colour: s.colour,
    baselinePct: null, units: s.units,
    chapters: s.chapters.map((c) => ({
      ...c,
      estHours: defaultHours(s.id, c),
      status: "garage", revisions: 0, confidence: 3,
    })),
  }));
}

/** First run: build a fresh state from the onboarding answers. */
export function createInitial({ name, raceNumber, hours, baseline, statuses }) {
  const subjects = seedSubjects();
  for (const s of subjects) {
    if (baseline && baseline[s.id] !== undefined && baseline[s.id] !== "") s.baselinePct = Number(baseline[s.id]);
  }
  if (statuses) for (const s of subjects) for (const c of s.chapters) if (statuses[c.id]) c.status = statuses[c.id];
  const settings = defaultSettings();
  settings.student = { name: name || "", raceNumber: raceNumber || "" };
  if (hours) Object.assign(settings.hours, hours);
  state = {
    schemaVersion: SCHEMA_VERSION,
    createdAt: dayKey(),
    lastExportAt: null,
    settings,
    subjects,
    logs: [],
    overrides: [],
    internal: [
      { id: uid("int"), text: "Hindi: internal assessment work", done: false },
      { id: uid("int"), text: "IT (402): practical file / project", done: false },
    ],
  };
  persist();
  return state;
}

export function migrate(d) {
  if (!d || typeof d !== "object") throw new Error("not an object");
  if (!d.schemaVersion) d.schemaVersion = 1;
  if (d.schemaVersion > SCHEMA_VERSION) throw new Error("This backup is from a newer version of Pit Wall");
  d.settings = { ...defaultSettings(), ...(d.settings || {}) };
  d.settings.hours = { ...defaultSettings().hours, ...(d.settings.hours || {}) };
  d.logs ||= []; d.overrides ||= []; d.internal ||= []; d.subjects ||= [];
  for (const s of d.subjects) for (const c of s.chapters || []) {
    if (!STATUSES.includes(c.status)) c.status = "garage";
    c.revisions ||= 0; c.confidence ||= 3;
  }
  // future: if (d.schemaVersion === 1) { ...; d.schemaVersion = 2; }
  return d;
}

export function resetAll() {
  safeDel(KEY); safeDel(TIMER_KEY);
  state = null;
  listeners.forEach((fn) => fn(state));
}

// ---------- export / import ----------

export function exportObject() {
  return { app: "pitwall", schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), ...structuredClone(state) };
}

export function markExported() { update((s) => { s.lastExportAt = dayKey(); }); }

/** Parse and validate a backup; returns {data, summary} or throws. */
export function parseImport(text) {
  const d = JSON.parse(text);
  if (d.app && d.app !== "pitwall") throw new Error("Not a Pit Wall backup");
  const data = migrate(d);
  if (!Array.isArray(data.subjects) || !data.subjects.length) throw new Error("Backup has no subjects");
  delete data.app; delete data.exportedAt;
  return {
    data,
    summary: {
      subjects: data.subjects.length,
      chapters: data.subjects.reduce((a, s) => a + s.chapters.length, 0),
      logs: data.logs.length,
      name: data.settings.student?.name || "",
    },
  };
}

export function importReplace(data) { state = migrate(structuredClone(data)); persist(); }

/** Merge: union of logs (dedupe by id), furthest chapter status/revisions win, own settings kept. */
export function importMerge(data) {
  update((s) => {
    const ids = new Set(s.logs.map((l) => l.id));
    for (const l of data.logs) if (!ids.has(l.id)) s.logs.push(l);
    s.logs.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    for (const inSub of data.subjects) {
      const sub = s.subjects.find((x) => x.id === inSub.id);
      if (!sub) { s.subjects.push(inSub); continue; }
      for (const inCh of inSub.chapters) {
        const ch = sub.chapters.find((x) => x.id === inCh.id);
        if (!ch) { sub.chapters.push(inCh); continue; }
        if (STATUSES.indexOf(inCh.status) > STATUSES.indexOf(ch.status)) ch.status = inCh.status;
        ch.revisions = Math.max(ch.revisions || 0, inCh.revisions || 0);
      }
    }
    const od = new Set(s.overrides.map((o) => o.date));
    for (const o of data.overrides || []) if (!od.has(o.date)) s.overrides.push(o);
  });
}

// ---------- small per-device UI flags (e.g. "reminder already sent today") ----------
export function uiFlag(name, value) {
  const k = "pitwall.flag." + name;
  if (value === undefined) return safeGet(k);
  value === null ? safeDel(k) : safeSet(k, String(value));
}

// ---------- stint timer (survives reloads) ----------

export function getTimer() { try { return JSON.parse(safeGet(TIMER_KEY)); } catch { return null; } }
export function setTimer(t) { t ? safeSet(TIMER_KEY, JSON.stringify(t)) : safeDel(TIMER_KEY); }
