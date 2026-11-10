// telemetry.js: analytics. Charts are hand-made SVG: thin marks, recessive grid, hover tooltips, table view.
import { esc, fmtDay, fmtHM, fmtH, addDays, daysBetween } from "../util.js";
import { budgetFor } from "../engine.js";

const W = 320, H = 150, PAD = { l: 26, r: 8, t: 10, b: 20 };

export function view(state, plan) {
  const hist = plan.history; // last 28 days
  const maxY = Math.max(1, ...hist.map((d) => Math.max(d.done, d.target))) * 1.1;
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const bw = iw / hist.length;
  const y = (v) => PAD.t + ih - (v / maxY) * ih;
  const ticks = niceTicks(maxY);
  const pbKey = plan.purple.key;

  const bars = hist.map((d, i) => {
    const x = PAD.l + i * bw;
    const h = Math.max(0, (d.done / maxY) * ih);
    const state_ = d.key === pbKey && d.done > 0 ? "pb" : d.target > 0 && d.done >= d.target ? "hit" : "miss";
    const col = state_ === "pb" ? "var(--pw-purple)" : state_ === "hit" ? "var(--pw-flag-green)" : "var(--pw-accent)";
    const barW = Math.max(2, bw - 3);
    const r = Math.min(3, barW / 2, h);
    // rounded top, square baseline
    const path = h > 0 ? `M${x + 1.5},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} z` : "";
    const tgt = d.target > 0 ? `<line x1="${x + 1}" x2="${x + bw - 1}" y1="${y(d.target)}" y2="${y(d.target)}" stroke="var(--pw-flag-yellow)" stroke-width="2" stroke-linecap="round"/>` : "";
    return `${path ? `<path d="${path}" fill="${col}" opacity="${d.active ? 1 : .35}"/>` : ""}${tgt}
      <rect class="hit" x="${x}" y="${PAD.t}" width="${bw}" height="${ih}" data-tip="<b>${fmtDay(d.key, true)}</b><br>${fmtHM(d.done)} of ${fmtHM(d.target)} target${state_ === "pb" ? "<br>🟣 personal best" : d.target > 0 ? (d.done >= d.target ? "<br>🟢 target met" : "<br>under target") : ""}"/>`;
  }).join("");
  const xLabels = [0, 7, 14, 21, 27].map((i) => `<text x="${PAD.l + i * bw + bw / 2}" y="${H - 5}" text-anchor="middle">${fmtDay(hist[i].key)}</text>`).join("");
  const grid = ticks.map((t) => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}"/>`).join("");
  const yLabels = ticks.map((t) => `<text x="${PAD.l - 5}" y="${y(t) + 3}" text-anchor="end">${t}h</text>`).join("");

  // ---- cumulative: logged vs budgeted since the season started ----
  const start = state.createdAt && daysBetween(state.createdAt, plan.today) >= 0 ? state.createdAt : plan.today;
  const span = Math.max(1, daysBetween(start, plan.today) + 1);
  const series = [];
  let cl = 0, cb = 0;
  const byDay = new Map();
  for (const l of state.logs) byDay.set(l.date, (byDay.get(l.date) || 0) + l.minutes / 60);
  for (let i = 0; i < span; i++) {
    const k = addDays(start, i);
    cl += byDay.get(k) || 0; cb += budgetFor(state, k);
    series.push({ k, logged: cl, budget: cb });
  }
  const cMax = Math.max(1, cl, cb) * 1.1;
  const cx = (i) => PAD.l + (span === 1 ? iw / 2 : (i / (span - 1)) * iw);
  const cy = (v) => PAD.t + ih - (v / cMax) * ih;
  const line = (key) => series.map((p, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)},${cy(p[key]).toFixed(1)}`).join("");
  const last = series[series.length - 1];
  const cTicks = niceTicks(cMax);
  const gap = last.logged - last.budget;

  // ---- subject split, last 7 days ----
  const by7 = plan.subjects.map((x) => {
    let h = 0;
    for (const l of state.logs) if (l.subjectId === x.id && daysBetween(l.date, plan.today) < 7 && daysBetween(l.date, plan.today) >= 0) h += l.minutes / 60;
    return { x, h };
  });
  const max7 = Math.max(1, ...by7.map((r) => r.h));
  const totalLogged = state.logs.reduce((a, l) => a + l.minutes, 0) / 60;

  return {
    title: "Telemetry",
    html: `
      <div class="card grid3" style="text-align:center">
        <div><div class="tt">Streak</div><div class="mid">${plan.streak}${plan.streak >= 3 ? " 🔥" : ""}</div><div class="hint">days ≥70%</div></div>
        <div><div class="tt">Last 7 days</div><div class="mid">${fmtH(plan.weekHours)}</div><div class="hint">${(plan.weekHours / 7).toFixed(1)}h/day</div></div>
        <div><div class="tt">Purple day</div><div class="mid purple">${fmtH(plan.purple.hours)}</div><div class="hint">${plan.purple.key ? fmtDay(plan.purple.key) : "–"}</div></div>
      </div>

      <div class="card">
        <div class="tt">Hours per day vs target · last 28 laps</div>
        <div class="legend" style="margin:6px 0 2px"><span><i style="background:var(--pw-flag-green)"></i>target met</span><span><i style="background:var(--pw-accent)"></i>under target</span><span><i style="background:var(--pw-purple)"></i>personal best</span><span><i style="background:var(--pw-flag-yellow);height:3px;vertical-align:3px"></i>target</span></div>
        <div class="chart" data-chart>
          <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily study hours for the last 28 days against target">
            <g class="grid">${grid}</g><g class="axis">${yLabels}${xLabels}</g>${bars}
          </svg><div class="tip" hidden></div>
        </div>
        <details class="sr-table"><summary>Show as table</summary><table><tr><th>Day</th><th>Done</th><th>Target</th></tr>
          ${hist.slice().reverse().filter((d) => d.active).map((d) => `<tr><td>${fmtDay(d.key, true)}</td><td>${fmtHM(d.done)}</td><td>${fmtHM(d.target)}</td></tr>`).join("")}</table></details>
      </div>

      <div class="card">
        <div class="tt">Season pace · hours logged vs hours budgeted since ${fmtDay(start)}</div>
        <div class="chart" data-chart-line style="margin-top:6px">
          <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative hours logged versus budgeted">
            <g class="grid">${cTicks.map((t) => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${cy(t)}" y2="${cy(t)}"/>`).join("")}</g>
            <g class="axis">${cTicks.map((t) => `<text x="${PAD.l - 5}" y="${cy(t) + 3}" text-anchor="end">${t}</text>`).join("")}
              <text x="${PAD.l}" y="${H - 5}">${fmtDay(start)}</text><text x="${W - PAD.r}" y="${H - 5}" text-anchor="end">today</text></g>
            <path d="${line("budget")}" fill="none" stroke="var(--pw-dim)" stroke-width="2" stroke-dasharray="4 4"/>
            <path d="${line("logged")}" fill="none" stroke="var(--pw-accent)" stroke-width="2" stroke-linejoin="round"/>
            <line class="xh" x1="0" x2="0" y1="${PAD.t}" y2="${PAD.t + ih}" stroke="var(--pw-muted)" stroke-width="1" hidden/>
            <rect class="hit" x="${PAD.l}" y="${PAD.t}" width="${iw}" height="${ih}"/>
          </svg><div class="tip" hidden></div>
        </div>
        <div class="legend" style="margin-top:4px"><span><i style="background:var(--pw-accent)"></i>logged ${fmtH(last.logged)}</span><span><i style="background:var(--pw-dim)"></i>budgeted ${fmtH(last.budget)}</span>
          <span class="${gap >= 0 ? "green" : "red"}">${gap >= 0 ? "▲" : "▼"} ${fmtH(Math.abs(gap))} ${gap >= 0 ? "ahead of" : "behind"} your own budget</span></div>
      </div>

      <div class="card">
        <div class="tt">Where the last 7 days went</div>
        <div class="stack" style="margin-top:8px">${by7.map(({ x, h }) => `
          <div><div class="row small"><span>${esc(x.name)}</span><span class="num">${fmtHM(h)} · ${fmtH(x.rem, 0)} left</span></div>
            <div class="bar" style="height:8px;margin-top:3px"><b style="width:${(h / max7) * 100}%;background:${x.colour}"></b></div></div>`).join("")}</div>
        <p class="hint" style="margin-top:8px">Total logged this season: ${fmtH(totalLogged)} · ${plan.totals.chaptersDone}/${plan.totals.chaptersTotal} items chequered.</p>
      </div>`,
    mount(root) {
      // bar tooltips
      const c = root.querySelector("[data-chart]");
      const tip = c.querySelector(".tip");
      const show = (e) => {
        const t = e.target.closest("[data-tip]"); if (!t) return;
        tip.innerHTML = t.dataset.tip; tip.hidden = false;
        const r = c.getBoundingClientRect(), b = t.getBoundingClientRect();
        tip.style.left = Math.min(r.width - 60, Math.max(60, b.left - r.left + b.width / 2)) + "px";
        tip.style.top = "30px";
      };
      c.addEventListener("pointermove", show);
      c.addEventListener("pointerdown", show);
      c.addEventListener("pointerleave", () => (tip.hidden = true));
      // line crosshair
      const lc = root.querySelector("[data-chart-line]");
      const ltip = lc.querySelector(".tip"), xh = lc.querySelector(".xh"), svg = lc.querySelector("svg");
      const move = (e) => {
        const r = svg.getBoundingClientRect();
        const sx = ((e.clientX - r.left) / r.width) * W;
        const i = Math.max(0, Math.min(series.length - 1, Math.round(((sx - PAD.l) / iw) * (series.length - 1))));
        const p = series[i];
        xh.setAttribute("x1", cx(i)); xh.setAttribute("x2", cx(i)); xh.removeAttribute("hidden");
        ltip.innerHTML = `<b>${fmtDay(p.k, true)}</b><br>logged ${fmtH(p.logged)}<br>budgeted ${fmtH(p.budget)}`;
        ltip.hidden = false;
        ltip.style.left = Math.min(r.width - 60, Math.max(60, (cx(i) / W) * r.width)) + "px";
        ltip.style.top = "30px";
      };
      lc.addEventListener("pointermove", move);
      lc.addEventListener("pointerdown", move);
      lc.addEventListener("pointerleave", () => { ltip.hidden = true; xh.setAttribute("hidden", ""); });
    },
  };
}

function niceTicks(max) {
  const step = max <= 4 ? 1 : max <= 8 ? 2 : max <= 20 ? 5 : max <= 50 ? 10 : max <= 200 ? 50 : max <= 500 ? 100 : 250;
  const out = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}
