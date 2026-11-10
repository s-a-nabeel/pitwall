// log.js: the Log Lap bottom sheet. Logging is the ONLY way progress moves.
import { esc, uid, dayKey, addDays, fmtDay, fmtSigned } from "../util.js";
import { STATUSES, STATUS_LABEL, isPlannable } from "../engine.js";
import { register, openSheet, refreshSheet, closeSheet, current, toast, findChapter, sheetForm } from "./common.js";
import { update, getTimer, setTimer } from "../store.js";

const TYPES = ["learn", "practice", "revise", "test"];

export function openLog(prefill = {}) {
  const { state } = current();
  const today = dayKey();
  const timer = getTimer();
  let subjectId = prefill.subjectId || timer?.subjectId || state.subjects[0].id;
  let chapterId = prefill.chapterId ?? timer?.chapterId ?? "";
  let minutes = Number(prefill.minutes) || 45;
  if (timer && (!prefill.chapterId || prefill.chapterId === timer.chapterId)) {
    minutes = Math.max(5, Math.round((Date.now() - timer.startedAt) / 60000 / 5) * 5);
  }
  const f = chapterId ? findChapter(state, chapterId) : null;
  const status0 = f?.chapter.status || "garage";
  const type = prefill.type || (status0 === "done" ? "revise" : status0 === "flying" ? "practice" : "learn");
  const form = {
    date: today, subjectId, chapterId, minutes, type,
    status: f ? suggestStatus(status0, type) : null,
    countRevision: type === "revise" && status0 === "done",
    confidence: f?.chapter.confidence || 3,
    note: "",
  };
  openSheet(renderLog, form);
}

function suggestStatus(st, type) {
  if (st === "garage" && (type === "learn" || type === "practice")) return "outlap";
  return st;
}

function renderLog(fm) {
  const { state } = current();
  const sub = state.subjects.find((s) => s.id === fm.subjectId);
  const f = fm.chapterId ? findChapter(state, fm.chapterId) : null;
  const ch = f?.chapter;
  const timer = getTimer();
  const today = dayKey();
  const chOptions = sub.chapters.filter(isPlannable).map((c) =>
    `<option value="${esc(c.id)}" ${c.id === fm.chapterId ? "selected" : ""}>${c.status === "done" ? "🏁 " : ""}${esc(c.name)}${c.kind === "skill" ? " (practice)" : ""}</option>`).join("");

  const statusBlock = ch && ch.kind !== "skill" ? `
    <div class="tt">Status after this lap</div>
    <div class="steps">${STATUSES.map((st) => `<button type="button" class="${st === fm.status ? "on" : ""} ${st === "done" ? "done" : ""}" data-action="log.status" data-v="${st}">${st === "done" ? "🏁 Done" : STATUS_LABEL[st]}</button>`).join("")}</div>
    ${fm.status === "done" ? `<label class="toggle"><span>Count as revision lap ${(ch.revisions || 0) + 1} of ${state.settings.revisionPasses}${ch.status !== "done" ? " (first finish doesn't need this)" : ""}</span>
      <input type="checkbox" data-action="log.countRev" ${fm.countRevision ? "checked" : ""}></label>` : ""}
    <div class="row"><span class="small muted">Confidence</span><span class="stars">${[1, 2, 3, 4, 5].map((n) =>
      `<button type="button" class="${n <= fm.confidence ? "on" : ""}" data-action="log.conf" data-v="${n}" aria-label="${n} stars">★</button>`).join("")}</span></div>` : "";

  return `
    <div class="row"><h2>Log lap</h2>
      ${timer ? `<button class="btn ghost" data-action="log.timerCancel">Cancel timer</button>`
              : `<button class="btn ghost" data-action="log.timerStart">⏱ Start stint</button>`}</div>
    <div class="chips">${state.subjects.map((s) =>
      `<button type="button" class="chip ${s.id === fm.subjectId ? "on" : ""}" data-action="log.subject" data-v="${s.id}" style="${s.id === fm.subjectId ? "" : `border-left:4px solid ${s.colour}`}">${esc(s.name.replace("English Language & Literature", "English").replace("Mathematics", "Maths"))}</button>`).join("")}</div>
    <label class="f">Chapter
      <select class="in" data-change="log.chapter"><option value="">General ${esc(sub.name)} study</option>${chOptions}</select></label>
    ${ch?.note ? `<p class="hint">ℹ ${esc(ch.note)}</p>` : ""}
    <div class="tt">Minutes</div>
    <div class="chips">${[25, 45, 60, 90].map((m) => `<button type="button" class="chip ${fm.minutes === m ? "on" : ""}" data-action="log.minutes" data-v="${m}">${m}</button>`).join("")}
      <input class="in" style="width:96px;min-height:36px;padding:6px 10px" type="number" min="5" max="600" step="5" inputmode="numeric" value="${fm.minutes}" data-bind="minutes" aria-label="Custom minutes"></div>
    <div class="tt">Type</div>
    <div class="chips">${TYPES.map((t) => `<button type="button" class="chip ${fm.type === t ? "on" : ""}" data-action="log.type" data-v="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div>
    ${statusBlock}
    <div class="row" style="gap:8px">
      <label class="f" style="flex:1">When
        <select class="in" data-change="log.date">${[0, 1, 2, 3].map((i) => { const k = addDays(today, -i); return `<option value="${k}" ${k === fm.date ? "selected" : ""}>${i === 0 ? "Today" : i === 1 ? "Yesterday" : fmtDay(k, true)}</option>`; }).join("")}</select></label>
      <label class="f" style="flex:2">Note (optional)<input class="in" value="${esc(fm.note)}" data-bind="note" placeholder="e.g. Ex 6.2 done" maxlength="120"></label>
    </div>
    <button class="btn block" data-action="log.save">Save lap → replan</button>`;
}

register({
  "log.open": (el) => openLog({ subjectId: el.dataset.subject, chapterId: el.dataset.chapter, minutes: el.dataset.minutes, type: el.dataset.type }),
  "log.subject": (el, e, fm = sheet()) => { fm.subjectId = el.dataset.v; fm.chapterId = ""; fm.status = null; refreshSheet(); },
  "log.chapter": (el, e, fm = sheet()) => {
    fm.chapterId = el.value;
    const f = el.value ? findChapter(current().state, el.value) : null;
    fm.status = f ? suggestStatus(f.chapter.status || "garage", fm.type) : null;
    fm.confidence = f?.chapter.confidence || 3;
    if (f?.chapter.status === "done") { fm.type = "revise"; fm.countRevision = true; }
    refreshSheet();
  },
  "log.minutes": (el, e, fm = sheet()) => { fm.minutes = Number(el.dataset.v); refreshSheet(); },
  "log.type": (el, e, fm = sheet()) => { fm.type = el.dataset.v; if (fm.type === "revise" && fm.status === "done") fm.countRevision = true; refreshSheet(); },
  "log.status": (el, e, fm = sheet()) => { fm.status = el.dataset.v; refreshSheet(); },
  "log.countRev": (el, e, fm = sheet()) => { fm.countRevision = !fm.countRevision; refreshSheet(); },
  "log.conf": (el, e, fm = sheet()) => { fm.confidence = Number(el.dataset.v); refreshSheet(); },
  "log.date": (el, e, fm = sheet()) => { fm.date = el.value; },
  "log.timerStart": (el, e, fm = sheet()) => {
    setTimer({ startedAt: Date.now(), subjectId: fm.subjectId, chapterId: fm.chapterId });
    closeSheet(); toast("⏱ Stint started. Lights out, go go go!");
    update(() => {}); // re-render Race Control to show the running timer
  },
  "log.timerCancel": () => { setTimer(null); refreshSheet(); update(() => {}); toast("Timer cancelled"); },
  "log.save": () => {
    const fm = sheet();
    const minutes = Math.round(Number(fm.minutes) || 0);
    if (minutes < 1) return toast("Enter the minutes first");
    const before = current().plan.delta;
    update((s) => {
      s.logs.push({ id: uid("log"), date: fm.date, subjectId: fm.subjectId, chapterId: fm.chapterId || null, minutes, type: fm.type, note: (fm.note || "").trim(), ts: Date.now() });
      if (fm.chapterId) {
        const f = findChapter(s, fm.chapterId);
        if (f && f.chapter.kind !== "skill") {
          const wasDone = f.chapter.status === "done";
          if (fm.status) f.chapter.status = fm.status;
          if (fm.status === "done" && wasDone && fm.countRevision) f.chapter.revisions = (f.chapter.revisions || 0) + 1;
          f.chapter.confidence = fm.confidence;
        }
      }
    });
    setTimer(null);
    closeSheet();
    const after = current().plan.delta;
    toast(`Lap saved 🏎 Delta ${fmtSigned(before)} → ${fmtSigned(after)}`);
  },
});

function sheet() { return sheetForm; }
