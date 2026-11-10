// sectors.js: subjects (constructors) and their chapters. Add / edit / reorder / delete chapters here.
import { esc, fmtDay, fmtH, uid } from "../util.js";
import { STATUSES, STATUS_LABEL, isPlannable } from "../engine.js";
import { register, openSheet, refreshSheet, closeSheet, current, toast, tyre, statusTag, boardTag, findChapter, sheetForm, ratioClass, fmtRatio } from "./common.js";
import { update, defaultHours } from "../store.js";
import { openLog } from "./log.js";

export function view(state, plan, arg) {
  if (arg) {
    const x = plan.subjects.find((s) => s.id === arg);
    if (x) return detail(state, plan, x);
  }
  const cards = plan.subjects.map((x) => {
    const proj = x.rem <= 0.01 ? `<span class="green">all done 🏁</span>`
      : x.projected ? `<span class="${x.late ? "red" : "green"}">finish ~${fmtDay(x.projected)}</span>` : `<span class="muted">log laps to see pace</span>`;
    return `<a class="card" href="#sectors/${x.id}" style="text-decoration:none;border-left:5px solid ${x.colour}">
      <div class="row"><b style="font:700 17px var(--pw-font-display)">${esc(x.name)}</b><span class="tt">${x.examPassed ? "done" : `${x.daysToExam}d · ${fmtDay(x.exam, true)}`}</span></div>
      <div class="bar" style="margin:10px 0 8px"><b style="width:${(x.progress * 100).toFixed(0)}%;background:${x.colour}"></b></div>
      <div class="row small"><span class="muted">${x.doneCount}/${x.planCount} 🏁 · ${Math.round(x.progress * 100)}%</span><span>${fmtH(x.rem, 0)} left</span>${proj}</div>
    </a>`;
  }).join("");

  const internal = (state.internal || []).map((it) => `
    <div class="li"><input type="checkbox" ${it.done ? "checked" : ""} data-action="sec.intToggle" data-id="${it.id}" style="width:22px;height:22px;accent-color:var(--pw-accent)" aria-label="done">
      <div class="n" style="${it.done ? "text-decoration:line-through;opacity:.6" : ""}">${esc(it.text)}</div>
      <button class="btn ghost" data-action="sec.intDel" data-id="${it.id}" aria-label="Delete">✕</button></div>`).join("");

  return {
    title: "Sectors",
    html: `${cards}
      <div class="h2">Internal only (no board paper)</div>
      <div class="card"><p class="hint">Hindi and IT have internal assessment only, so they get no study hours and don't affect the flags. Keep a simple to-do here.</p>
        <div class="list" style="margin-top:6px">${internal || `<p class="muted small">Nothing yet.</p>`}</div>
        <form class="row" style="margin-top:8px" data-action-form><input class="in" id="int-new" placeholder="e.g. IT practical file: submit by 20 Dec" maxlength="120">
          <button class="btn" data-action="sec.intAdd">Add</button></form></div>`,
  };
}

function detail(state, plan, x) {
  const sub = state.subjects.find((s) => s.id === x.id);
  const units = [];
  for (const c of x.chapters) {
    if (!c.plannable) continue;
    let u = units.find((u) => u.name === c.unit);
    if (!u) units.push((u = { name: c.unit, items: [], marks: sub.units?.find((m) => m.name === c.unit || m.name.startsWith(c.unit) || c.unit.startsWith(m.name))?.marks }));
    u.items.push(c);
  }
  const off = x.chapters.filter((c) => !c.plannable);
  const row = (c) => {
    const passes = state.settings.revisionPasses;
    const revDots = c.kind === "skill" ? "" : ` · rev ${c.revisions || 0}/${passes}`;
    const est = sub.chapters.find((k) => k.id === c.id)?.estHours ?? 0;
    return `<div class="li tap ${c.plannable ? "" : "greyed"}" data-action="sec.editChapter" data-id="${esc(c.id)}" role="button" tabindex="0">
      ${tyre(c.compound)}
      <div class="n"><b>${esc(c.name)}</b><small>${c.kind === "skill" ? `practice ${c.logged.toFixed(1)}/${est}h` : `${c.logged.toFixed(1)}h logged / est ${est}h${revDots}`}${c.plannable && c.rem > 0.01 ? ` · ${c.rem.toFixed(1)}h left` : ""}</small></div>
      ${boardTag(c)} ${c.plannable ? statusTag(c) : ""}</div>`;
  };
  const calibNote = Math.abs(x.calib - 1) > 0.02 ? ` · pace calibrated ×${x.calib.toFixed(2)} from your logs` : "";
  const baseline = sub.baselinePct != null ? `Report card ${Math.round(sub.baselinePct)}%` : "No report-card mark set";
  return {
    title: esc(x.name.replace("English Language & Literature", "English")),
    back: "#sectors",
    right: `<button class="btn ghost" data-action="sec.editSubject" data-id="${x.id}">Edit</button>`,
    html: `
      <div class="card grid3" style="text-align:center">
        <div><div class="tt">Work left</div><div class="mid">${fmtH(x.rem, 0)}</div></div>
        <div><div class="tt">Runway</div><div class="mid">${fmtH(x.avail ?? 0, 0)}</div></div>
        <div><div class="tt">Load</div><div class="mid ${ratioClass(x.load)}">${fmtRatio(x.load)}</div></div>
      </div>
      <p class="hint">Paper ${fmtDay(x.exam, true)} (${x.daysToExam} days) · ${baseline}${calibNote}. Runway = all your study hours until the day before this paper; load = work left ÷ runway (shared with other subjects).
        ${x.projected && x.rem > 0.01 ? `At this week's pace (${x.pace.toFixed(1)}h/day) you finish <b class="${x.late ? "red" : "green"}">${fmtDay(x.projected)}</b>.` : ""}</p>
      ${units.map((u) => `<div class="h2">${esc(u.name)}${u.marks ? ` · ${u.marks} marks` : ""}</div><div class="card list" style="padding:2px 14px">${u.items.map(row).join("")}</div>`).join("")}
      ${off.length ? `<div class="h2">Not in the board paper</div><div class="card list" style="padding:2px 14px">${off.map(row).join("")}</div>` : ""}
      <button class="btn ghost block" data-action="sec.newChapter" data-subject="${x.id}">+ Add chapter</button>`,
  };
}

// ---------- chapter editor ----------
function openChapter(subjectId, chapterId) {
  const { state } = current();
  const sub = state.subjects.find((s) => s.id === subjectId);
  const ch = chapterId ? sub.chapters.find((c) => c.id === chapterId) : null;
  const form = ch ? { ...ch, isNew: false, subjectId } : {
    isNew: true, subjectId, id: uid(subjectId), name: "", unit: sub.units?.[0]?.name || "", compound: "medium", kind: "chapter",
    estHours: defaultHours(subjectId, { compound: "medium", kind: "chapter" }), status: "garage", revisions: 0, confidence: 3, board: true, note: "",
  };
  openSheet(renderChapter, form);
}

function renderChapter(fm) {
  const { state } = current();
  const sub = state.subjects.find((s) => s.id === fm.subjectId);
  const units = [...new Set([...(sub.units || []).map((u) => u.name), ...sub.chapters.map((c) => c.unit)])].filter(Boolean);
  const boardOpts = [[true, "In board paper"], ["partial", "Partly (see note)"], ["internal", "Internal only"], [false, "Excluded"]];
  return `
    <div class="row"><h2>${fm.isNew ? "New chapter" : "Chapter"}</h2>${fm.isNew ? "" : `<button class="btn" data-action="sec.logChapter">Log time</button>`}</div>
    <label class="f">Name<input class="in" data-bind="name" value="${esc(fm.name)}" maxlength="100" ${fm.isNew ? "autofocus" : ""}></label>
    <label class="f">Unit<input class="in" data-bind="unit" value="${esc(fm.unit)}" list="units-dl"><datalist id="units-dl">${units.map((u) => `<option value="${esc(u)}">`).join("")}</datalist></label>
    <div class="tt">Tyre (difficulty)</div>
    <div class="chips">${["soft", "medium", "hard"].map((c) => `<button type="button" class="chip ${fm.compound === c ? "on" : ""}" data-action="sec.compound" data-v="${c}">${tyre(c)} ${c}</button>`).join("")}</div>
    <div class="row" style="gap:8px">
      <label class="f" style="flex:1">Estimated hours<input class="in" type="number" min="0.5" max="60" step="0.5" data-bind="estHours" value="${fm.estHours}" inputmode="decimal"></label>
      <label class="f" style="flex:1">Type<select class="in" data-change="sec.kind"><option value="chapter" ${fm.kind !== "skill" ? "selected" : ""}>Chapter</option><option value="skill" ${fm.kind === "skill" ? "selected" : ""}>Skill (practice)</option></select></label>
    </div>
    ${fm.kind !== "skill" ? `
    <div class="tt">Status</div>
    <div class="steps">${STATUSES.map((st) => `<button type="button" class="${st === fm.status ? "on" : ""} ${st === "done" ? "done" : ""}" data-action="sec.status" data-v="${st}">${st === "done" ? "🏁 Done" : STATUS_LABEL[st]}</button>`).join("")}</div>
    <div class="row"><span class="small muted">Revision laps done</span>
      <span class="btnrow" style="flex:none;align-items:center"><button class="btn ghost" data-action="sec.rev" data-v="-1">−</button><b class="mid" style="min-width:36px;text-align:center">${fm.revisions || 0}</b><button class="btn ghost" data-action="sec.rev" data-v="1">+</button></span></div>
    <div class="row"><span class="small muted">Confidence</span><span class="stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="${n <= fm.confidence ? "on" : ""}" data-action="sec.conf" data-v="${n}">★</button>`).join("")}</span></div>` : ""}
    <label class="f">Board exam<select class="in" data-change="sec.board">${boardOpts.map(([v, l]) => `<option value="${String(v)}" ${String(fm.board) === String(v) ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label class="f">Note<textarea class="in" rows="2" data-bind="note" maxlength="300">${esc(fm.note || "")}</textarea></label>
    <button class="btn block" data-action="sec.saveChapter">${fm.isNew ? "Add chapter" : "Save"}</button>
    ${fm.isNew ? "" : `<div class="btnrow"><button class="btn ghost" data-action="sec.move" data-v="-1">↑ Move up</button><button class="btn ghost" data-action="sec.move" data-v="1">↓ Move down</button><button class="btn danger" data-action="sec.deleteChapter">Delete</button></div>`}`;
}

// ---------- subject editor ----------
function renderSubject(fm) {
  return `<h2>${esc(fm.name)}</h2>
    <label class="f">Board paper date<input class="in" type="date" data-bind="exam" value="${esc(fm.exam)}"></label>
    <label class="f">Report card mark (PT2, out of 80), used to give weaker subjects more time
      <input class="in" type="number" min="0" max="80" step="0.5" inputmode="decimal" data-bind="marks80" value="${fm.marks80 ?? ""}" placeholder="e.g. 58"></label>
    <label class="f">Team colour<input class="in" type="color" data-bind="colour" value="${esc(fm.colour)}" style="height:44px;padding:4px"></label>
    <button class="btn block" data-action="sec.saveSubject">Save</button>
    <button class="btn ghost block" data-action="sec.resetEstimates">Reset all hour estimates to tyre defaults</button>`;
}

const fm = () => sheetForm;
register({
  "sec.editChapter": (el) => { const f = findChapter(current().state, el.dataset.id); if (f) openChapter(f.subject.id, f.chapter.id); },
  "sec.newChapter": (el) => openChapter(el.dataset.subject, null),
  "sec.compound": (el) => {
    const f = fm();
    const wasDefault = Number(f.estHours) === defaultHours(f.subjectId, f);
    f.compound = el.dataset.v;
    if (wasDefault) f.estHours = defaultHours(f.subjectId, f);
    refreshSheet();
  },
  "sec.kind": (el) => { fm().kind = el.value; refreshSheet(); },
  "sec.status": (el) => { fm().status = el.dataset.v; refreshSheet(); },
  "sec.rev": (el) => { const f = fm(); f.revisions = Math.max(0, (f.revisions || 0) + Number(el.dataset.v)); refreshSheet(); },
  "sec.conf": (el) => { fm().confidence = Number(el.dataset.v); refreshSheet(); },
  "sec.board": (el) => { const v = el.value; fm().board = v === "true" ? true : v === "false" ? false : v; },
  "sec.logChapter": () => { const f = fm(); closeSheet(); openLog({ subjectId: f.subjectId, chapterId: f.id }); },
  "sec.saveChapter": () => {
    const f = fm();
    if (!String(f.name || "").trim()) return toast("Give the chapter a name");
    const { isNew, subjectId, ...ch } = f;
    ch.name = ch.name.trim(); ch.estHours = Math.max(0.5, Number(ch.estHours) || 1);
    update((s) => {
      const sub = s.subjects.find((x) => x.id === subjectId);
      if (isNew) sub.chapters.push(ch);
      else { const i = sub.chapters.findIndex((c) => c.id === ch.id); sub.chapters[i] = { ...sub.chapters[i], ...ch }; }
    });
    closeSheet(); toast(isNew ? "Chapter added. Plan updated." : "Saved. Plan updated.");
  },
  "sec.move": (el) => {
    const f = fm(); const dir = Number(el.dataset.v);
    update((s) => {
      const arr = s.subjects.find((x) => x.id === f.subjectId).chapters;
      const i = arr.findIndex((c) => c.id === f.id), j = i + dir;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    });
    toast(dir < 0 ? "Moved up" : "Moved down");
  },
  "sec.deleteChapter": () => {
    const f = fm();
    const logs = current().state.logs.filter((l) => l.chapterId === f.id).length;
    if (!confirm(`Delete "${f.name}"?${logs ? ` Its ${logs} logs stay in your history as general study.` : ""}`)) return;
    update((s) => {
      const sub = s.subjects.find((x) => x.id === f.subjectId);
      sub.chapters = sub.chapters.filter((c) => c.id !== f.id);
      for (const l of s.logs) if (l.chapterId === f.id) l.chapterId = null;
    });
    closeSheet(); toast("Chapter deleted");
  },
  "sec.editSubject": (el) => {
    const s = current().state.subjects.find((x) => x.id === el.dataset.id);
    openSheet(renderSubject, { id: s.id, name: s.name, exam: s.exam, colour: s.colour, marks80: s.baselinePct != null ? +(s.baselinePct * 0.8).toFixed(1) : "" });
  },
  "sec.saveSubject": () => {
    const f = fm();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.exam)) return toast("Pick a valid date");
    update((s) => {
      const sub = s.subjects.find((x) => x.id === f.id);
      sub.exam = f.exam; sub.colour = f.colour;
      sub.baselinePct = f.marks80 === "" || f.marks80 == null ? null : Math.min(100, (Number(f.marks80) / 80) * 100);
    });
    closeSheet(); toast("Subject saved. Plan updated.");
  },
  "sec.resetEstimates": () => {
    const f = fm();
    if (!confirm("Reset every chapter's estimated hours in this subject to the tyre defaults?")) return;
    update((s) => { const sub = s.subjects.find((x) => x.id === f.id); for (const c of sub.chapters) c.estHours = defaultHours(sub.id, c); });
    closeSheet(); toast("Estimates reset");
  },
  "sec.intAdd": () => {
    const inp = document.getElementById("int-new");
    const text = inp.value.trim(); if (!text) return;
    update((s) => { s.internal.push({ id: uid("int"), text, done: false }); });
  },
  "sec.intToggle": (el) => update((s) => { const it = s.internal.find((i) => i.id === el.dataset.id); it.done = !it.done; }),
  "sec.intDel": (el) => update((s) => { s.internal = s.internal.filter((i) => i.id !== el.dataset.id); }),
});
