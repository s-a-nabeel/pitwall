// onboarding.js: first run. Personal data (name, marks) is entered here, never shipped in the repo.
import { register, toast } from "./common.js";
import { createInitial } from "../store.js";
import { SEED } from "../seed-syllabus.js";
import { esc, fmtDay } from "../util.js";

export function view() {
  const subs = [...SEED.subjects].sort((a, b) => a.exam.localeCompare(b.exam));
  return `
    <main>
      <div class="hero"><h1>PIT <b>WALL</b></h1><p>Race strategy for the CBSE Class X boards 2027. Every day: what to study, how much time is left, and whether you're on pace.</p></div>
      <div class="checker"></div>
      <div class="card stack">
        <div class="tt">1 · Driver</div>
        <div class="row" style="gap:8px">
          <label class="f" style="flex:2">Your name<input class="in" id="onb-name" maxlength="30" autocomplete="given-name"></label>
          <label class="f" style="flex:1">Race no.<input class="in" id="onb-num" maxlength="3" inputmode="numeric" placeholder="e.g. 12"></label>
        </div>
      </div>
      <div class="card stack">
        <div class="tt">2 · Report card: PT2 marks out of 80 (optional)</div>
        <p class="hint">Weaker subjects get more time. Leave blank if unsure; you can add these later.</p>
        <div class="marks">${subs.map((s) => `
          <span><span style="display:inline-block;width:4px;height:14px;background:${s.colour};margin-right:8px;vertical-align:-2px;border-radius:2px"></span>${esc(s.name)} <span class="hint">· ${fmtDay(s.exam)}</span></span>
          <input class="in" type="number" min="0" max="80" step="0.5" inputmode="decimal" id="onb-m-${s.id}" aria-label="${esc(s.name)} marks out of 80">`).join("")}</div>
      </div>
      <div class="card stack">
        <div class="tt">3 · Hours you can study</div>
        <div class="grid3">
          <label class="f">Weekday<input class="in" type="number" min="0" max="14" step="0.5" value="3" id="onb-wd" inputmode="decimal"></label>
          <label class="f">Saturday<input class="in" type="number" min="0" max="14" step="0.5" value="6" id="onb-sat" inputmode="decimal"></label>
          <label class="f">Sunday<input class="in" type="number" min="0" max="14" step="0.5" value="6" id="onb-sun" inputmode="decimal"></label>
        </div>
        <p class="hint">Be honest; the app shows the truth either way. You can change this any time in Strategy Wall.</p>
      </div>
      <button class="btn block" data-action="onb.start">🏁 Lights out: start the season</button>
      <button class="btn ghost block" data-action="share.importPick">I have a backup file: restore it</button>
      <p class="hint" style="text-align:center">After starting, open <b>Sectors</b> and mark the chapters your school has already finished.</p>
    </main>`;
}

register({
  "onb.start": () => {
    const v = (id) => document.getElementById(id)?.value.trim() ?? "";
    const baseline = {};
    for (const s of SEED.subjects) {
      const m = v("onb-m-" + s.id);
      if (m !== "") baseline[s.id] = Math.min(100, (Number(m) / 80) * 100);
    }
    const num = (id, d) => { const x = Number(v(id)); return v(id) === "" || !isFinite(x) ? d : Math.max(0, x); };
    createInitial({
      name: v("onb-name"), raceNumber: v("onb-num"), baseline,
      hours: { weekday: num("onb-wd", 3), saturday: num("onb-sat", 6), sunday: num("onb-sun", 6) },
    });
    location.hash = "#race";
    toast("Lights out and away we go! 🏎");
  },
});
