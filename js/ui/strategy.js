// strategy.js: Strategy Wall (settings). Every change replans instantly.
import { esc, weekdayName } from "../util.js";
import { register, toast, current } from "./common.js";
import { update, resetAll } from "../store.js";
import { requestNotify } from "./notify.js";

const LIVERIES = [["scarlet", "#E10600", "Scarlet"], ["papaya", "#FF8000", "Papaya"], ["silver", "#00D2BE", "Silver Arrow"], ["racing-green", "#00A86B", "Racing Green"], ["midnight", "#3671C6", "Midnight"]];

export function view(state, plan) {
  const s = state.settings, h = s.hours;
  const weekTotal = [0, 1, 2, 3, 4, 5, 6].reduce((a, wd) => a + dayBudget(h, wd), 0);
  const weekNeed = plan.needPerDay * 7;
  const slider = (key, label) => `
    <div><div class="row"><span>${label}</span><output id="out-${key}" class="mid">${h[key]}h</output></div>
      <input class="slider" type="range" min="0" max="12" step="0.5" value="${h[key]}" data-out="out-${key}" data-unit="h" data-change="str.hours" data-k="${key}" aria-label="${label} hours"></div>`;
  const order = [1, 2, 3, 4, 5, 6, 0];

  return {
    title: "Strategy Wall",
    html: `
      <div class="card stack">
        <div class="tt">Hours budget</div>
        ${slider("weekday", "Weekday (Mon–Fri)")}
        ${slider("saturday", "Saturday")}
        ${slider("sunday", "Sunday")}
        <p class="small">Week total <b class="num">${weekTotal.toFixed(1)}h</b> · plan needs <b class="num ${weekNeed > weekTotal + 0.05 ? "red" : "green"}">${weekNeed.toFixed(1)}h</b> per week right now</p>
        <details><summary class="small muted" style="cursor:pointer">Per-weekday override (e.g. tuition on Wednesdays)</summary>
          <div class="grid3" style="grid-template-columns:repeat(7,1fr);gap:4px;margin-top:8px">${order.map((wd) => `
            <label class="f" style="text-align:center;font-size:11px">${weekdayName(wd)}
              <input class="in" style="padding:6px 2px;text-align:center" type="number" min="0" max="16" step="0.5" inputmode="decimal" placeholder="${dayBudget({ ...h, perWeekday: {} }, wd)}" value="${h.perWeekday?.[wd] ?? ""}" data-change="str.perWeekday" data-wd="${wd}"></label>`).join("")}</div>
          <p class="hint" style="margin-top:4px">Leave blank to use the weekday/weekend value. Single dates (sick, pre-boards) go in the Calendar.</p></details>
      </div>

      <div class="card stack">
        <div class="tt">Race strategy</div>
        <div><div class="row"><span>Parc Fermé: revision-only days before Lights Out</span><output id="out-pf" class="mid">${s.revisionBufferDays}d</output></div>
          <input class="slider" type="range" min="0" max="45" step="1" value="${s.revisionBufferDays}" data-out="out-pf" data-unit="d" data-change="str.num" data-k="revisionBufferDays"></div>
        <div class="row"><span>Revision laps per chapter</span><span class="chips">${[0, 1, 2, 3].map((n) => `<button class="chip ${s.revisionPasses === n ? "on" : ""}" data-action="str.passes" data-v="${n}">${n}</button>`).join("")}</span></div>
        <label class="toggle"><span>Give weaker subjects more time (uses report card)</span><input type="checkbox" ${s.weakBoost ? "checked" : ""} data-change="str.bool" data-k="weakBoost"></label>
      </div>

      <div class="card stack">
        <div class="tt">Report card · PT2 (out of 80)</div>
        <div class="marks">${state.subjects.map((sub) => `
          <span><span class="team" style="display:inline-block;width:4px;height:14px;background:${sub.colour};margin-right:8px;vertical-align:-2px"></span>${esc(sub.name)}</span>
          <input class="in" type="number" min="0" max="80" step="0.5" inputmode="decimal" value="${sub.baselinePct != null ? +(sub.baselinePct * 0.8).toFixed(1) : ""}" data-change="str.marks" data-id="${sub.id}" aria-label="${esc(sub.name)} marks out of 80">`).join("")}</div>
      </div>

      <div class="card stack">
        <div class="tt">Grand Prix dates</div>
        <div class="marks" style="grid-template-columns:1fr 160px">${[...state.subjects].sort((a, b) => a.exam.localeCompare(b.exam)).map((sub) => `
          <span>${esc(sub.name)}</span><input class="in" type="date" value="${sub.exam}" data-change="str.exam" data-id="${sub.id}">`).join("")}</div>
        <p class="hint">Source: CBSE date sheet of 06.11.2026. All papers 10:30 AM.</p>
      </div>

      <div class="card stack">
        <div class="tt">Driver</div>
        <div class="row" style="gap:8px">
          <label class="f" style="flex:2">Name<input class="in" value="${esc(s.student.name)}" data-change="str.student" data-k="name" maxlength="30"></label>
          <label class="f" style="flex:1">Race no.<input class="in" value="${esc(s.student.raceNumber)}" data-change="str.student" data-k="raceNumber" maxlength="3" inputmode="numeric"></label>
        </div>
        <div class="tt" style="margin-top:4px">Livery</div>
        <div class="chips">${LIVERIES.map(([id, col, name]) => `<button class="chip ${s.livery === id ? "on" : ""}" data-action="str.livery" data-v="${id}"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${col};margin-right:6px;vertical-align:-1px"></span>${name}</button>`).join("")}</div>
        <p class="hint">Want more? Edit <code>css/theme.css</code>; every colour is a variable there.</p>
      </div>

      <div class="card stack">
        <div class="tt">Team radio reminders</div>
        <label class="toggle"><span>Remind me if today's target isn't met</span><input type="checkbox" ${s.notify ? "checked" : ""} data-change="str.notify"></label>
        <label class="toggle"><span>Reminder time</span><input class="in" style="width:130px" type="time" value="${esc(s.reminderTime)}" data-change="str.reminderTime"></label>
        <p class="hint">Works while Pit Wall is open or installed on the phone (Add to Home screen). A website can't buzz you when it's fully closed.</p>
      </div>

      <div class="card stack">
        <div class="tt">Data · backup & share</div>
        <button class="btn block" data-action="share.open">📻 Team Radio: WhatsApp / Drive / backup</button>
        <button class="btn ghost block" data-action="share.importPick">⬇ Import a backup (.json)</button>
        <p class="hint">Everything lives on this device only. Back up weekly, and use the backup file to move to another phone or laptop.</p>
      </div>

      <div class="card stack">
        <div class="tt">Danger zone</div>
        <button class="btn danger block" data-action="str.reset">Reset everything</button>
      </div>
      <p class="hint" style="text-align:center">Pit Wall · CBSE X 2026-27 · data stays on this device</p>`,
  };
}

function dayBudget(h, wd) {
  const per = h.perWeekday?.[wd];
  if (per !== undefined && per !== null && per !== "") return Number(per);
  return wd === 6 ? h.saturday : wd === 0 ? h.sunday : h.weekday;
}

register({
  "str.hours": (el) => { update((s) => { s.settings.hours[el.dataset.k] = Number(el.value); }); toast("Budget updated. Plan rebalanced."); },
  "str.perWeekday": (el) => update((s) => {
    const p = { ...(s.settings.hours.perWeekday || {}) };
    if (el.value === "") delete p[el.dataset.wd]; else p[el.dataset.wd] = Number(el.value);
    s.settings.hours.perWeekday = p;
  }),
  "str.num": (el) => update((s) => { s.settings[el.dataset.k] = Number(el.value); }),
  "str.bool": (el) => update((s) => { s.settings[el.dataset.k] = el.checked; }),
  "str.passes": (el) => update((s) => { s.settings.revisionPasses = Number(el.dataset.v); }),
  "str.marks": (el) => update((s) => {
    const sub = s.subjects.find((x) => x.id === el.dataset.id);
    sub.baselinePct = el.value === "" ? null : Math.min(100, (Number(el.value) / 80) * 100);
  }),
  "str.exam": (el) => { if (!el.value) return; update((s) => { s.subjects.find((x) => x.id === el.dataset.id).exam = el.value; }); toast("Date changed. Plan rebalanced."); },
  "str.student": (el) => update((s) => { s.settings.student[el.dataset.k] = el.value.trim(); }),
  "str.livery": (el) => update((s) => { s.settings.livery = el.dataset.v; }),
  "str.reminderTime": (el) => update((s) => { s.settings.reminderTime = el.value || "20:00"; }),
  "str.notify": async (el) => {
    const want = el.checked;
    if (want && !(await requestNotify())) { el.checked = false; toast("Notifications are blocked in this browser"); return; }
    update((s) => { s.settings.notify = want; });
  },
  "str.reset": () => {
    if (!confirm("Reset EVERYTHING? All logs and progress on this device will be deleted.")) return;
    if (!confirm("Really? Make sure you have a backup. This cannot be undone.")) return;
    resetAll(); location.hash = ""; toast("Reset done");
  },
});
