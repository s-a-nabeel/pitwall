// Engine + store tests. Run: node tools/test-engine.mjs
// Uses an in-memory localStorage so store.js works under Node.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { computePlan, budgetFor } = await import("../js/engine.js");
const store = await import("../js/store.js");

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.log("  ✗", msg); } };
const TODAY = "2026-11-10";

function fresh(hours) {
  const s = store.createInitial({ name: "Test", raceNumber: "12", hours, baseline: { maths: 72.5, science: 87.5, english: 93.75, malayalam: 88.75, sst: 85 } });
  s.createdAt = "2026-11-01";
  return structuredClone(s);
}
const summary = (p) => `ratio ${p.ratio.toFixed(2)} · flag ${p.flag} · delta ${p.delta.toFixed(1)}h · need ${p.needPerDay.toFixed(2)}h/day · stints ${p.todayPlan.stints.length}`;

console.log("\n1. Baseline (3h weekday / 6h weekend, nothing done)");
let st = fresh();
let p = computePlan(st, TODAY);
console.log("   ", summary(p), "· binding:", p.binding.label);
ok(p.lapsToGo === 99, "99 laps to lights out (10 Nov → 17 Feb)");
ok(p.subjects.map((x) => x.id).join() === "maths,science,english,malayalam,sst", "subjects sorted by exam date");
ok(p.totals.chaptersTotal === 96, `96 plannable items (got ${p.totals.chaptersTotal})`);
ok(p.subjects.find((x) => x.id === "science").chapters.find((c) => c.name.startsWith("Periodic")).plannable === false, "Periodic Classification is not planned");
const stintMin = p.todayPlan.stints.reduce((a, x) => a + x.minutes, 0);
ok(Math.abs(stintMin - p.todayPlan.target * 60) <= 15, `stints fill today's target (${stintMin} min vs ${p.todayPlan.target * 60})`);
ok(p.todayPlan.stints[0].subjectId === "maths", "first stint is Maths (weakest + first paper)");
console.log("    stints:", p.todayPlan.stints.map((s) => `${s.subjectId}:${s.chapterName.slice(0, 18)} ${s.minutes}m ${s.type}${s.drs ? " DRS" : ""}`).join(" | "));
for (const x of p.subjects) console.log(`    ${x.id.padEnd(9)} rem ${x.rem.toFixed(1).padStart(6)}h  cumRatio ${x.ratio.toFixed(2)}`);

console.log("\n2. Weekday hours 3 → 4 updates the plan");
const st4 = fresh({ weekday: 4 });
const p4 = computePlan(st4, TODAY);
console.log("   ", summary(p4));
ok(p4.ratio < p.ratio, "ratio improves");
ok(p4.delta > p.delta, "delta improves");

console.log("\n3. Log 60 min on Real Numbers + mark it done");
const st3 = structuredClone(st);
const rn = st3.subjects[0].chapters[0];
rn.status = "done";
st3.logs.push({ id: "l1", date: TODAY, subjectId: "maths", chapterId: rn.id, minutes: 60, type: "learn", ts: 1 });
const p3 = computePlan(st3, TODAY);
const m0 = p.subjects.find((x) => x.id === "maths"), m3 = p3.subjects.find((x) => x.id === "maths");
console.log("   ", summary(p3));
ok(m3.rem < m0.rem, `Maths remaining drops (${m0.rem.toFixed(1)} → ${m3.rem.toFixed(1)})`);
ok(p3.todayPlan.done === 1, "today's done = 1h");
ok(!p3.todayPlan.stints.some((s) => s.chapterId === rn.id && s.type === "learn"), "Real Numbers no longer has a learn stint");

console.log("\n4. Logging time without a status change still counts (floor 10%)");
const st5 = structuredClone(st);
st5.logs.push({ id: "l2", date: TODAY, subjectId: "maths", chapterId: st5.subjects[0].chapters[5].id, minutes: 120, type: "learn", ts: 2 });
const p5 = computePlan(st5, TODAY);
const tri0 = m0.chapters[5].learnRem, tri5 = p5.subjects[0].chapters[5].learnRem;
ok(tri5 < tri0 && tri5 > 0, `Triangles learnRem ${tri0.toFixed(1)} → ${tri5.toFixed(1)}h`);

console.log("\n5. Safety Car day (0h) reduces capacity");
const st6 = structuredClone(st);
st6.overrides.push({ date: "2026-11-15", hours: 0, reason: "sick" });
ok(budgetFor(st6, "2026-11-15") === 0, "override sets the day to 0h");
ok(computePlan(st6, TODAY).delta < p.delta, "delta worsens (deficit spread over the remaining days)");

console.log("\n6. Missed days drive the flag");
const st7 = fresh({ weekday: 1, saturday: 1, sunday: 1 }); // tiny budget → ratio huge, but test missed logic separately
const generous = fresh({ weekday: 12, saturday: 12, sunday: 12 });
generous.createdAt = "2026-11-01";
let pg = computePlan(generous, TODAY);
ok(pg.twoWeak === true && pg.flag === "red", "two days under 50% → RED even with a generous budget");
generous.logs.push({ id: "a", date: "2026-11-08", subjectId: "maths", chapterId: null, minutes: 720, type: "learn" });
generous.logs.push({ id: "b", date: "2026-11-09", subjectId: "maths", chapterId: null, minutes: 720, type: "learn" });
pg = computePlan(generous, TODAY);
ok(!pg.twoWeak && !pg.missedYesterday, "logging the hours clears the missed-day flags");
ok(computePlan(st7, TODAY).flag === "red", "1h/day budget → RED");

console.log("\n7. Exam window: all time goes to the next paper");
const pe = computePlan(st, "2027-02-23");
ok(pe.todayPlan.stints.length > 0 && pe.todayPlan.stints.every((s) => s.subjectId === "english"), "on 23 Feb every stint is English");

console.log("\n8. Export → reset → import gives an identical state");
const before = JSON.stringify(store.getState());
const exp = JSON.stringify(store.exportObject());
store.resetAll();
ok(store.getState() === null, "reset clears state");
const { data, summary: sm } = store.parseImport(exp);
store.importReplace(data);
ok(JSON.stringify(store.getState()) === before, `round-trip identical (${sm.logs} logs, ${sm.chapters} chapters)`);
let threw = false; try { store.parseImport('{"app":"other"}'); } catch { threw = true; }
ok(threw, "rejects a non-Pit-Wall file");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
