// engine.js: the race strategist. Pure functions: (state, todayKey) → plan.
// Nothing here touches the DOM or storage. Every number on screen is derived here,
// on every change. Run `node tools/test-engine.mjs` to test.

import { addDays, daysBetween, weekday, clamp, round5 } from "./util.js";

export const STATUSES = ["garage", "outlap", "flying", "done"];
export const STATUS_LABEL = { garage: "Garage", outlap: "Out-lap", flying: "Flying lap", done: "Chequered" };
export const STATUS_HINT = {
  garage: "not started", outlap: "learning", flying: "practising", done: "chapter complete",
};
const STATUS_FACTOR = { garage: 1, outlap: 0.7, flying: 0.35, done: 0 };
export const COMPOUND_HOURS = { soft: 3, medium: 5, hard: 8 };
export const SKILL_HOURS = { soft: 3, medium: 5, hard: 6 };
// Language literature pieces (a poem, a short story) are smaller than a Maths/Science chapter.
export const LIT_HOURS = { soft: 1.5, medium: 2.5, hard: 4 };
export const LANGUAGE_SUBJECTS = ["english", "malayalam"];

export const isPlannable = (ch) => ch.board === true || ch.board === "partial";
export const revHours = (ch) => Math.max(0.5, (ch.estHours || 0) * 0.2);

// ---------- capacity ----------

/** Planned study hours for a given day (override → per-weekday → weekday/sat/sun). */
export function budgetFor(state, key) {
  const o = (state.overrides || []).find((x) => x.date === key);
  if (o) return Math.max(0, Number(o.hours) || 0);
  const h = state.settings.hours;
  const wd = weekday(key);
  const per = h.perWeekday && h.perWeekday[wd];
  if (per !== undefined && per !== null && per !== "") return Number(per);
  if (wd === 6) return h.saturday;
  if (wd === 0) return h.sunday;
  return h.weekday;
}

/** Hours available from today (minus what's already logged today) through endKey inclusive. */
function capacity(state, today, endKey, loggedToday) {
  if (daysBetween(today, endKey) < 0) return { hours: 0, days: 0 };
  let hours = Math.max(0, budgetFor(state, today) - loggedToday);
  let days = 1;
  for (let k = addDays(today, 1); daysBetween(k, endKey) >= 0; k = addDays(k, 1)) {
    hours += budgetFor(state, k);
    days++;
  }
  return { hours, days };
}

// ---------- logs ----------

function indexLogs(logs) {
  const byDay = new Map(), byChapter = new Map(), bySubjectDay = new Map();
  for (const l of logs || []) {
    const h = (Number(l.minutes) || 0) / 60;
    byDay.set(l.date, (byDay.get(l.date) || 0) + h);
    if (l.chapterId) {
      const c = byChapter.get(l.chapterId) || { learn: 0, revise: 0, all: 0 };
      if (l.type === "revise") c.revise += h; else c.learn += h;
      c.all += h;
      byChapter.set(l.chapterId, c);
    }
    const sk = l.subjectId + "|" + l.date;
    bySubjectDay.set(sk, (bySubjectDay.get(sk) || 0) + h);
  }
  return { byDay, byChapter, bySubjectDay };
}

// ---------- remaining work ----------

function subjectCalibration(subject, logIdx) {
  // Compare real logged learn/practice hours with what the estimates predicted, but only on
  // chapters he has actually logged (chapters finished in school before the app don't skew it).
  let expected = 0, actual = 0;
  for (const ch of subject.chapters) {
    if (!isPlannable(ch) || ch.kind === "skill") continue;
    const lg = logIdx.byChapter.get(ch.id);
    if (!lg || lg.learn <= 0) continue;
    expected += ch.estHours * (1 - STATUS_FACTOR[ch.status || "garage"]);
    actual += lg.learn;
  }
  if (expected >= 5 && actual > 0) return clamp(actual / expected, 0.6, 1.6);
  return 1;
}

function chapterRemaining(ch, calib, passes, logIdx) {
  const lg = logIdx.byChapter.get(ch.id) || { learn: 0, revise: 0, all: 0 };
  if (ch.kind === "skill") {
    const learn = Math.max(0, ch.estHours - lg.all);
    return { learn, rev: 0, total: ch.estHours, logged: lg.all };
  }
  const est = ch.estHours * calib;
  const status = ch.status || "garage";
  let learn = 0;
  if (status !== "done") {
    // Both the status and the logged hours reduce it, never below 10% until it is marked done.
    learn = Math.min(est * STATUS_FACTOR[status], Math.max(est - lg.learn, est * 0.1));
  }
  const rh = revHours(ch);
  const rev = Math.max(0, passes - (ch.revisions || 0)) * rh;
  return { learn, rev, total: est + passes * rh, logged: lg.all };
}

function unitMarks(subject, ch) {
  const u = (subject.units || []).find((x) =>
    x.name === ch.unit || x.name.startsWith(ch.unit) || ch.unit.startsWith(x.name));
  if (!u) return null;
  const inUnit = subject.chapters.filter((c) => isPlannable(c) && c.unit === ch.unit).length || 1;
  return u.marks / inUnit;
}

// ---------- main ----------

export function computePlan(state, today) {
  const s = state.settings;
  const passes = s.revisionPasses;
  const logIdx = indexLogs(state.logs);
  const loggedToday = logIdx.byDay.get(today) || 0;

  const subjects = [...state.subjects].sort((a, b) => a.exam.localeCompare(b.exam));
  const firstExam = subjects[0]?.exam;
  const lastExam = subjects[subjects.length - 1]?.exam;
  const pfKey = firstExam ? addDays(firstExam, -s.revisionBufferDays) : null; // Parc Fermé start

  // per-subject derived data
  const subj = subjects.map((sub) => {
    const calib = subjectCalibration(sub, logIdx);
    let learn = 0, rev = 0, total = 0;
    let doneCount = 0, planCount = 0;
    const chapters = sub.chapters.map((ch) => {
      const plannable = isPlannable(ch);
      const r = plannable ? chapterRemaining(ch, calib, passes, logIdx) : { learn: 0, rev: 0, total: 0, logged: (logIdx.byChapter.get(ch.id) || {}).all || 0 };
      if (plannable) {
        learn += r.learn; rev += r.rev; total += r.total; planCount++;
        if (ch.kind === "skill" ? r.learn === 0 : ch.status === "done") doneCount++;
      }
      return { ...ch, plannable, learnRem: r.learn, revRem: r.rev, rem: r.learn + r.rev, logged: r.logged, marks: plannable ? unitMarks(sub, ch) : null };
    });
    // last-7-day pace (hours/day) in this subject
    let last7 = 0;
    for (let i = 0; i < 7; i++) last7 += logIdx.bySubjectDay.get(sub.id + "|" + addDays(today, -i)) || 0;
    const pace = last7 / 7;
    const rem = learn + rev;
    const examPassed = daysBetween(today, sub.exam) < 0;
    const projected = rem <= 0 ? today : pace > 0 ? addDays(today, Math.ceil(rem / pace)) : null;
    const deadline = addDays(sub.exam, -1);
    return {
      id: sub.id, name: sub.name, colour: sub.colour, exam: sub.exam, baselinePct: sub.baselinePct,
      calib, learnRem: learn, revRem: rev, rem, total,
      progress: total > 0 ? 1 - rem / total : 1,
      doneCount, planCount, chapters, pace, projected, examPassed,
      daysToExam: daysBetween(today, sub.exam),
      late: !!(projected && rem > 0 && daysBetween(projected, deadline) < 0 && pace > 0),
    };
  });

  // Feasibility, earliest deadline first: everything due by paper k must fit in the hours before
  // paper k. If this fails, no daily split can fix it, only more hours.
  let cum = 0;
  let worst = { ratio: 0, req: 0, avail: 0, days: 0, label: "", subjectId: null };
  for (const x of subj) {
    if (x.examPassed) { x.ratio = 0; x.load = 0; continue; }
    cum += x.rem;
    const cap = capacity(state, today, addDays(x.exam, -1), loggedToday);
    x.cumReq = cum; x.avail = cap.hours; x.days = cap.days;
    x.load = cap.hours > 0 ? x.rem / cap.hours : x.rem > 0 ? Infinity : 0; // this subject alone vs its own runway
    x.ratio = cap.hours > 0 ? cum / cap.hours : cum > 0 ? Infinity : 0;
    if (x.ratio > worst.ratio) worst = { ratio: x.ratio, req: cum, avail: cap.hours, days: cap.days, label: `everything due by ${x.name}`, subjectId: x.id };
  }
  // New chapters must be finished before Parc Fermé.
  const learnTotal = subj.filter((x) => !x.examPassed).reduce((a, x) => a + x.learnRem, 0);
  let learnRatio = 0, pfAvail = 0;
  if (pfKey && daysBetween(today, pfKey) > 0) {
    const cap = capacity(state, today, addDays(pfKey, -1), loggedToday);
    pfAvail = cap.hours;
    learnRatio = cap.hours > 0 ? learnTotal / cap.hours : learnTotal > 0 ? Infinity : 0;
    if (learnRatio > worst.ratio) worst = { ratio: learnRatio, req: learnTotal, avail: cap.hours, days: cap.days, label: "new chapters before Parc Fermé", subjectId: null, pf: true };
  }
  const ratio = worst.ratio;
  const delta = worst.avail - worst.req;
  const needPerDay = worst.days ? worst.req / worst.days : 0;
  const budgetPerDay = worst.days ? worst.avail / worst.days : 0;

  // ---------- history / streak ----------
  const startKey = state.createdAt || today;
  const history = [];
  for (let i = 27; i >= 0; i--) {
    const k = addDays(today, -i);
    history.push({ key: k, done: logIdx.byDay.get(k) || 0, target: budgetFor(state, k), active: daysBetween(startKey, k) >= 0 });
  }
  const y1 = history[history.length - 2], y2 = history[history.length - 3];
  const weak = (d) => d && d.active && d.target > 0 && d.done < 0.5 * d.target;
  const missedYesterday = !!(y1 && y1.active && y1.target > 0 && y1.done < 0.7 * y1.target);
  const twoWeak = weak(y1) && weak(y2);
  let streak = 0;
  const todayRow = history[history.length - 1];
  const hit = (d) => d.target === 0 || d.done >= 0.7 * d.target;
  if (todayRow.target > 0 && todayRow.done >= 0.7 * todayRow.target) streak = 1;
  for (let i = history.length - 2; i >= 0; i--) {
    const d = history[i];
    if (!d.active || !hit(d)) break;
    if (d.target > 0) streak++;
  }
  let purple = { hours: 0, key: null };
  for (const [k, h] of logIdx.byDay) if (h > purple.hours) purple = { hours: h, key: k };
  const weekHours = history.slice(-7).reduce((a, d) => a + d.done, 0);

  // ---------- flags ----------
  const reasons = [];
  const anyLate = subj.find((x) => x.late && !x.examPassed);
  let flag = "green";
  if (ratio > 1.05) { flag = "red"; reasons.push("deficit"); }
  if (twoWeak) { flag = "red"; reasons.push("twoWeakDays"); }
  if (anyLate) { flag = "red"; reasons.push("late:" + anyLate.id); }
  if (flag !== "red") {
    if (ratio > 0.9) { flag = "yellow"; reasons.push("tight"); }
    if (missedYesterday) { flag = "yellow"; reasons.push("missedYesterday"); }
  }

  // ---------- today's stints ----------
  const budgetToday = budgetFor(state, today);
  const target = ratio > 1 ? Math.min(Math.max(budgetToday, needPerDay), budgetToday + 3) : budgetToday;
  const minutesLeft = round5(Math.max(0, target - loggedToday) * 60);
  const drsFrom = round5(Math.max(0, budgetToday - loggedToday) * 60); // minutes beyond this are DRS
  const stints = planStints(subj, today, firstExam, pfKey, minutesLeft, drsFrom, s.weakBoost);

  // weekend DRS suggestion: spread the deficit over the remaining weekend days
  let drsWeekend = 0;
  if (delta < 0 && worst.days) {
    let weekendDays = 0;
    for (let i = 0; i < worst.days; i++) { const wd = weekday(addDays(today, i)); if (wd === 0 || wd === 6) weekendDays++; }
    if (weekendDays) drsWeekend = -delta / weekendDays;
  }

  const lapsToGo = firstExam ? daysBetween(today, firstExam) : 0;
  const nextExam = subj.find((x) => x.daysToExam >= 0);

  return {
    today, firstExam, lastExam, pfKey, lapsToGo, nextExam: nextExam ? { id: nextExam.id, name: nextExam.name, exam: nextExam.exam, daysToExam: nextExam.daysToExam } : null,
    ratio, learnRatio, pfAvail, delta, needPerDay, budgetPerDay, binding: worst,
    flag, reasons, missedYesterday, twoWeak,
    subjects: subj,
    todayPlan: { budget: budgetToday, target, done: loggedToday, stints },
    history, streak, purple, weekHours, drsWeekend,
    totals: {
      rem: subj.reduce((a, x) => a + (x.examPassed ? 0 : x.rem), 0),
      chaptersDone: subj.reduce((a, x) => a + x.doneCount, 0),
      chaptersTotal: subj.reduce((a, x) => a + x.planCount, 0),
    },
  };
}

// ---------- stint planner ----------

function weaknessOf(pct) {
  if (pct === null || pct === undefined || pct === "") return 1;
  return clamp(1 + (0.75 - Number(pct) / 100), 0.8, 1.4);
}

function planStints(subj, today, firstExam, pfKey, minutes, drsFrom, weakBoost) {
  if (minutes < 15) return [];
  const live = subj.filter((x) => !x.examPassed && x.rem > 0.01 && x.exam !== today);
  if (!live.length) return [];

  // During the exam window, every hour goes to the next paper.
  const inExams = firstExam && daysBetween(firstExam, today) >= 0;
  const inPF = pfKey && daysBetween(pfKey, today) >= 0;
  let alloc;
  if (inExams) {
    alloc = [{ s: live[0], min: minutes }];
  } else {
    // weight = share of this subject's own remaining runway it still needs (earlier paper → more urgent),
    // boosted for weaker subjects (report card).
    const w = live.map((x) => ({
      s: x,
      w: (x.rem / Math.max(1, x.avail || 1)) * (weakBoost ? weaknessOf(x.baselinePct) : 1),
    }));
    const W = w.reduce((a, x) => a + x.w, 0) || 1;
    w.sort((a, b) => b.w - a.w);
    alloc = w.map((x) => ({ s: x.s, min: round5((minutes * x.w) / W) }));
    // fold tiny slices (<20 min) into the top subject so every stint is worth sitting down for
    let spare = 0;
    alloc = alloc.filter((a, i) => { if (i > 0 && a.min < 20) { spare += a.min; return false; } return true; });
    alloc[0].min += spare;
    const diff = minutes - alloc.reduce((a, x) => a + x.min, 0);
    alloc[0].min += diff;
  }

  const stints = [];
  let used = 0;
  for (const { s, min } of alloc) {
    // candidate chapters for this subject
    const learnC = s.chapters.filter((c) => c.plannable && c.kind !== "skill" && c.learnRem > 0.01)
      .sort((a, b) => rankStatus(b) - rankStatus(a)); // continue in-progress chapters first (stable order otherwise)
    const revC = s.chapters.filter((c) => c.plannable && c.kind !== "skill" && c.learnRem <= 0.01 && c.revRem > 0.01)
      .sort((a, b) => (a.revisions || 0) - (b.revisions || 0) || (a.confidence || 3) - (b.confidence || 3) || (b.marks || 0) - (a.marks || 0));
    const skillC = s.chapters.filter((c) => c.plannable && c.kind === "skill" && c.learnRem > 0.01);
    let queue = [...learnC, ...revC];
    // one skill stint per subject per day when there is room
    if (skillC.length && min >= 60) queue.splice(1, 0, skillC[dayIndex(today) % skillC.length]);
    if (!queue.length) queue = skillC;

    let left = min;
    const MAX_PER_CHAPTER = 100; // focus: stay on one chapter, but not all day
    const cap = new Map(queue.map((c) => [c.id, Math.min(Math.round(c.rem * 60), c.kind === "skill" ? 30 : MAX_PER_CHAPTER)]));
    let guard = 0;
    while (left >= 15 && queue.length && guard++ < 60) {
      const c = queue[0];
      const room = cap.get(c.id);
      if (room < 10) { queue.shift(); continue; }
      const base = left <= 75 ? left : left < 100 ? round5(left / 2) : 50;
      const len = Math.min(base, Math.max(25, round5(room)));
      const type = c.kind === "skill" ? "practice" : c.learnRem > 0.01 ? (c.status === "flying" ? "practice" : "learn") : "revise";
      stints.push({ subjectId: s.id, subjectName: s.name, colour: s.colour, chapterId: c.id, chapterName: c.name, compound: c.compound, minutes: len, type, drs: used + len > drsFrom + 4 });
      used += len; left -= len;
      cap.set(c.id, room - len);
      if (cap.get(c.id) < 10) queue.shift();
    }
  }
  return stints;
}

const rankStatus = (c) => ({ flying: 3, outlap: 2, garage: 0, done: -1 }[c.status || "garage"]);
const dayIndex = (key) => Math.floor(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / 86400e3);
