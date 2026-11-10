// race.js: Race Control (home). What to do today, and how much margin is left.
import { esc, fmtDay, fmtH, fmtHM, fmtSigned, daysBetween } from "../util.js";
import { register, tyre, flagWord, findChapter, toast } from "./common.js";
import { update, getTimer } from "../store.js";

export function view(state, plan) {
  const t = plan.todayPlan;
  const parts = [];

  // ---- countdown ----
  const allDone = !plan.nextExam;
  if (allDone) {
    parts.push(`<div class="card"><div class="tt">Season complete</div><div class="big">🏁</div><p class="muted">All papers done. Chequered flag, driver.</p></div>`);
  } else {
    const nx = plan.nextExam;
    const inExams = daysBetween(plan.firstExam, plan.today) >= 0;
    const label = inExams ? `Next paper · ${nx.name}` : `Lights out · ${nx.name}`;
    const laps = inExams ? nx.daysToExam : plan.lapsToGo;
    const dCls = plan.delta >= 0 ? "green" : "red";
    parts.push(`
      <div class="card count">
        <div class="row"><div class="tt">${esc(label)} · ${fmtDay(nx.exam, true)} · 10:30</div>${flagWord(plan.flag)}</div>
        <div class="row" style="margin-top:8px;align-items:flex-end">
          <div><div class="big">${laps}<small>${laps === 1 ? "lap" : "laps"} to go</small></div>
            <div class="hint num" data-countdown="${nx.exam}T10:30:00+05:30"></div></div>
          <div style="text-align:right"><div class="mid ${dCls}">${fmtSigned(plan.delta)}</div><div class="tt">delta to plan</div></div>
        </div>
      </div>`);
  }

  // ---- Box Box (red) ----
  if (plan.flag === "red" && !allDone) parts.push(boxBox(plan));
  else if (plan.flag === "yellow") parts.push(yellowBanner(plan));

  // ---- backup reminder ----
  const lastExp = state.lastExportAt;
  if (state.logs.length >= 5 && (!lastExp || daysBetween(lastExp, plan.today) > 7)) {
    parts.push(`<div class="banner warn"><span>📻 ${lastExp ? `Last backup ${fmtDay(lastExp)}.` : "No backup yet."} Phone lost = season lost.</span><button class="btn ghost" data-action="share.open">Back up</button></div>`);
  }

  // ---- running stint timer ----
  const timer = getTimer();
  if (timer) {
    const f = findChapter(state, timer.chapterId);
    parts.push(`<div class="banner"><span>⏱ Stint running: <b>${esc(f?.chapter.name || "study")}</b> <span class="timer" style="font-size:15px" data-timer="${timer.startedAt}"></span></span>
      <button class="btn" data-action="log.open" data-subject="${esc(timer.subjectId || "")}" data-chapter="${esc(timer.chapterId || "")}">Stop & log</button></div>`);
  }

  // ---- today ----
  if (!allDone) {
    const pct = t.target > 0 ? Math.min(100, (t.done / t.target) * 100) : 100;
    const ringCol = pct >= 100 ? "var(--pw-flag-green)" : "var(--pw-accent)";
    const needLine = plan.ratio > 1
      ? `<div class="small red" style="margin-top:4px">Required to stay on plan: <b>${plan.needPerDay.toFixed(1)}h/day</b> (budget ${t.budget}h)</div>`
      : `<div class="small green" style="margin-top:4px">On plan. Budget ${t.budget}h covers it.</div>`;
    parts.push(`
      <div class="card row" style="justify-content:flex-start;gap:14px">
        <div class="ring" style="--p:${pct.toFixed(0)};--ring:${ringCol}"><i>${fmtHM(t.done)}<small>of ${fmtHM(t.target)}</small></i></div>
        <div style="flex:1;min-width:0">
          <div class="tt">Today · ${fmtDay(plan.today, true)}</div>
          <div class="mid">${t.done >= t.target && t.target > 0 ? "Target hit 🟢" : t.target === 0 ? "Pit stop day" : fmtHM(Math.max(0, t.target - t.done)) + " to go"}</div>
          ${needLine}
        </div>
      </div>`);
  }

  // ---- stints ----
  if (!allDone) {
    const rows = t.stints.map((s) => `
      <div class="li">
        <span class="team" style="background:${s.colour}"></span>${tyre(s.compound)}
        <div class="n"><b>${esc(s.chapterName)}</b><small>${esc(s.subjectName)} · ${s.minutes}m · ${s.type}</small></div>
        ${s.drs ? `<span class="tag drs" title="Extra stint to close the gap">DRS</span>` : ""}
        <button class="btn" data-action="log.open" data-subject="${s.subjectId}" data-chapter="${esc(s.chapterId)}" data-minutes="${s.minutes}" data-type="${s.type}">Log</button>
      </div>`).join("");
    parts.push(`
      <div class="card">
        <div class="row"><div class="tt">Today's stints</div><span class="hint">auto-planned, updates as you log</span></div>
        <div class="list" style="margin-top:4px">${rows || `<p class="muted" style="padding:10px 0">${t.target === 0 ? "Rest day. Pit stop. 🛞" : t.done >= t.target ? "Today's target is done. Extra laps still count. 🏁" : "Nothing planned."}</p>`}</div>
        <button class="btn ghost block" style="margin-top:8px" data-action="log.open">+ Log other study</button>
      </div>`);
  }

  // ---- done today ----
  const todays = state.logs.filter((l) => l.date === plan.today);
  if (todays.length) {
    parts.push(`<div class="card"><div class="tt">Laps completed today</div><div class="list" style="margin-top:4px">${todays.map((l) => {
      const f = findChapter(state, l.chapterId);
      const sub = state.subjects.find((s) => s.id === l.subjectId);
      return `<div class="li"><span class="team" style="background:${sub?.colour || "#888"}"></span>
        <div class="n"><b>${esc(f?.chapter.name || "General study")}</b><small>${esc(sub?.name || "")} · ${l.minutes}m · ${l.type}${l.note ? " · " + esc(l.note) : ""}</small></div>
        <button class="btn ghost" data-action="race.undoLog" data-id="${l.id}" aria-label="Delete this log">✕</button></div>`;
    }).join("")}</div></div>`);
  }

  // ---- timing tower ----
  const tower = [...plan.subjects].filter((x) => !x.examPassed).sort((a, b) => b.load - a.load);
  parts.push(`
    <div class="card tower">
      <div class="row" style="margin-bottom:2px"><div class="tt">Sectors · sorted by risk</div><a class="hint" href="#sectors">all chapters ›</a></div>
      ${tower.map((x, i) => {
        const proj = x.rem <= 0.01 ? `<span class="green">done</span>` : x.late ? `<span class="red">late</span>` : x.projected ? `<span class="green">on pace</span>` : `<span class="muted">no pace</span>`;
        return `<a class="r" href="#sectors/${x.id}">
          <span class="pos">P${i + 1}</span><span class="team" style="background:${x.colour}"></span>
          <span class="nm">${esc(x.name)}<small>${fmtDay(x.exam)} · ${x.doneCount}/${x.planCount} 🏁</small></span>
          <div class="bar" title="${Math.round(x.progress * 100)}% done"><b style="width:${(x.progress * 100).toFixed(0)}%;background:${x.colour}"></b></div>
          <span class="rt">${fmtH(x.rem, 0)}<small class="hint" style="display:block;font:400 11px var(--pw-font-body)">${proj}</small></span>
        </a>`;
      }).join("")}
      <p class="hint" style="margin-top:6px">Hours = work left (chapters + ${state.settings.revisionPasses} revision laps). Risk = work left ÷ hours until that paper.</p>
    </div>`);

  parts.push(`<button class="btn ghost block" data-action="share.open">📻 Team Radio: share progress</button>`);

  return {
    title: "Race Control",
    html: parts.join(""),
    mount() {
      const tick = () => document.querySelectorAll("[data-timer]").forEach((el) => {
        const s = Math.floor((Date.now() - Number(el.dataset.timer)) / 1000);
        el.textContent = `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      });
      tick();
      clearInterval(window.__pwTimer);
      if (document.querySelector("[data-timer]")) window.__pwTimer = setInterval(tick, 1000);
    },
  };
}

function boxBox(plan) {
  const msgs = [];
  if (plan.reasons.includes("deficit")) {
    const b = plan.binding;
    msgs.push(`<p><b style="display:inline;font-size:inherit">${fmtH(-plan.delta)} short</b> for ${esc(b.label)}. Needs <b style="display:inline;font-size:inherit">${plan.needPerDay.toFixed(1)}h/day</b>; your budget averages ${plan.budgetPerDay.toFixed(1)}h/day.</p>`);
    if (plan.drsWeekend > 0) msgs.push(`<p>DRS option: +${plan.drsWeekend.toFixed(1)}h on every weekend day closes the gap. <a href="#strategy" style="color:#fff">Adjust strategy ›</a></p>`);
  }
  if (plan.reasons.includes("twoWeakDays")) msgs.push(`<p>Two weak days in a row (under half the target). Get back on pace today; every lap counts.</p>`);
  const late = plan.reasons.find((r) => r.startsWith("late:"));
  if (late) {
    const s = plan.subjects.find((x) => x.id === late.slice(5));
    msgs.push(`<p>${esc(s.name)}: at this week's pace it finishes ${fmtDay(s.projected)}, after its paper (${fmtDay(s.exam)}).</p>`);
  }
  return `<div class="boxbox" role="alert"><b>📻 Box box, box box</b>${msgs.join("")}</div>`;
}

function yellowBanner(plan) {
  const y = plan.history[plan.history.length - 2];
  const bits = [];
  if (plan.missedYesterday) bits.push(`Yesterday: ${fmtHM(y.done)} of ${fmtHM(y.target)}. The shortfall is added to the gap.`);
  if (plan.reasons.includes("tight")) bits.push(`Margin is thin: ${Math.round(plan.ratio * 100)}% of the available hours are already needed.`);
  return `<div class="banner warn"><span>🟨 ${bits.join(" ")}</span></div>`;
}

register({
  "race.undoLog": (el) => {
    if (!confirm("Delete this log entry?")) return;
    update((s) => { s.logs = s.logs.filter((l) => l.id !== el.dataset.id); });
    toast("Log deleted. Plan updated.");
  },
});
