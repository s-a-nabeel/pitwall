// calendar.js: Race Calendar. Papers, Parc Fermé, Safety Car days (per-day hour overrides).
import { esc, fmtDay, addDays, daysBetween, weekday } from "../util.js";
import { budgetFor } from "../engine.js";
import { register, openSheet, refreshSheet, closeSheet, current, toast, sheetForm } from "./common.js";
import { update } from "../store.js";

const REASONS = [
  ["sick", "🚑 Sick"], ["holiday", "🏖 Holiday"], ["school-exam", "📝 School exam"],
  ["pre-board", "🏁 Pre-board"], ["event", "🎉 Event"], ["push", "🟣 DRS push"],
];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function view(state, plan) {
  const exams = [...state.subjects].sort((a, b) => a.exam.localeCompare(b.exam));
  const examOn = new Map(exams.map((s) => [s.exam, s]));
  const ovr = new Map(state.overrides.map((o) => [o.date, o]));
  const today = plan.today;
  const pfStart = plan.pfKey, first = plan.firstExam;

  // months from this month to the last paper's month
  const months = [];
  let y = +today.slice(0, 4), m = +today.slice(5, 7);
  const endY = +plan.lastExam.slice(0, 4), endM = +plan.lastExam.slice(5, 7);
  while (y < endY || (y === endY && m <= endM)) {
    months.push([y, m]);
    if (++m > 12) { m = 1; y++; }
  }
  const grid = months.map(([yy, mm]) => {
    const firstKey = `${yy}-${String(mm).padStart(2, "0")}-01`;
    const lead = (weekday(firstKey) + 6) % 7; // Monday-first
    const days = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    let cells = `<div class="mo">${MONTHS[mm - 1]} ${yy}</div>` + ["M", "T", "W", "T", "F", "S", "S"].map((d) => `<div class="wd">${d}</div>`).join("");
    cells += "<div></div>".repeat(lead);
    for (let d = 1; d <= days; d++) {
      const k = `${yy}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const ex = examOn.get(k);
      const cls = [
        daysBetween(k, today) > 0 ? "past" : "", k === today ? "today" : "",
        ex ? "exam" : ovr.has(k) ? "ovr" : pfStart && daysBetween(pfStart, k) >= 0 && daysBetween(k, first) > 0 ? "pf" : "",
      ].join(" ");
      const label = ex ? esc(short(ex.name)) : `${+budgetFor(state, k).toFixed(1)}h`;
      cells += `<button class="d ${cls}" data-action="cal.day" data-k="${k}" aria-label="${fmtDay(k, true)}: ${ex ? ex.name + " paper" : label}">${d}<small>${label}</small></button>`;
    }
    return cells;
  }).join("");

  const list = [...state.overrides].sort((a, b) => a.date.localeCompare(b.date)).filter((o) => daysBetween(today, o.date) >= -7);
  return {
    title: "Race Calendar",
    html: `
      <div class="card"><div class="tt">Grand Prix: board papers 2027 (10:30 AM)</div>
        <div class="list" style="margin-top:4px">${exams.map((s) => {
          const d = daysBetween(today, s.exam);
          return `<div class="li"><span class="team" style="background:${s.colour}"></span><div class="n"><b>${esc(s.name)}</b><small>${fmtDay(s.exam, true)}</small></div><span class="mid ${d < 0 ? "muted" : ""}">${d < 0 ? "✓" : d + "d"}</span></div>`;
        }).join("")}</div></div>
      <div class="legend"><span><i style="background:var(--pw-flag-red)"></i>Paper</span><span><i style="background:color-mix(in srgb,var(--pw-purple) 40%,var(--pw-pit))"></i>Parc Fermé (revision only, from ${pfStart ? fmtDay(pfStart) : "–"})</span><span><i style="background:color-mix(in srgb,var(--pw-flag-yellow) 45%,var(--pw-pit))"></i>Safety Car / changed day</span></div>
      <div class="card"><p class="hint" style="margin-bottom:6px">Tap a day to change its study hours (sick, school exam, holiday, pre-board, or an extra push). The plan rebalances instantly.</p>
        <div class="cal">${grid}</div></div>
      ${list.length ? `<div class="card"><div class="tt">Changed days</div><div class="list" style="margin-top:4px">${list.map((o) =>
        `<div class="li tap" data-action="cal.day" data-k="${o.date}" role="button"><div class="n"><b>${fmtDay(o.date, true)} · ${o.hours}h</b><small>${esc(reasonLabel(o.reason))}${o.note ? " · " + esc(o.note) : ""}</small></div><span class="hint">edit ›</span></div>`).join("")}</div></div>` : ""}`,
  };
}

const short = (n) => n.replace("Mathematics", "Maths").replace("English Language & Literature", "Eng").replace("Social Science", "SST").replace("Malayalam", "Mal").replace("Science", "Sci");
const reasonLabel = (r) => (REASONS.find((x) => x[0] === r) || [r, r])[1];

function renderDay(fm) {
  const { state } = current();
  const ex = state.subjects.find((s) => s.exam === fm.date);
  return `<h2>${fmtDay(fm.date, true)}</h2>
    ${ex ? `<p class="red"><b>${esc(ex.name)} paper, 10:30 AM.</b> Hours here are for the next paper's revision after you get home.</p>` : ""}
    <p class="hint">Normal budget for this weekday: ${fm.normal}h.${fm.existing ? " This day is currently changed." : ""}</p>
    <label class="f">Study hours this day <output id="day-h-out" class="mid" style="color:var(--pw-white)">${fm.hours}h</output>
      <input class="slider" type="range" min="0" max="12" step="0.5" value="${fm.hours}" data-bind="hours" data-out="day-h-out" data-unit="h"></label>
    <div class="chips">${REASONS.map(([k, l]) => `<button type="button" class="chip ${fm.reason === k ? "on" : ""}" data-action="cal.reason" data-v="${k}">${l}</button>`).join("")}</div>
    <label class="f">Note<input class="in" data-bind="note" value="${esc(fm.note || "")}" placeholder="e.g. Pre-board Maths" maxlength="80"></label>
    <button class="btn block" data-action="cal.save">Save day</button>
    ${fm.existing ? `<button class="btn ghost block" data-action="cal.remove">Back to normal (${fm.normal}h)</button>` : ""}`;
}

register({
  "cal.day": (el) => {
    const { state } = current();
    const k = el.dataset.k;
    const o = state.overrides.find((x) => x.date === k);
    const normal = budgetFor({ ...state, overrides: [] }, k);
    openSheet(renderDay, { date: k, normal, existing: !!o, hours: o ? o.hours : normal, reason: o?.reason || "sick", note: o?.note || "" });
  },
  "cal.reason": (el) => { sheetForm.reason = el.dataset.v; if (el.dataset.v === "sick" || el.dataset.v === "holiday") sheetForm.hours = sheetForm.reason === "sick" ? 0 : sheetForm.hours; refreshSheet(); },
  "cal.save": () => {
    const f = sheetForm;
    update((s) => {
      s.overrides = s.overrides.filter((o) => o.date !== f.date);
      s.overrides.push({ date: f.date, hours: Number(f.hours), reason: f.reason, note: (f.note || "").trim() });
    });
    closeSheet(); toast(`${fmtDay(f.date)} set to ${f.hours}h. Strategy rebalanced.`);
  },
  "cal.remove": () => {
    const f = sheetForm;
    update((s) => { s.overrides = s.overrides.filter((o) => o.date !== f.date); });
    closeSheet(); toast("Day back to normal");
  },
});
