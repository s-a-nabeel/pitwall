// share.js: Team Radio. WhatsApp summary, JSON backup (share sheet → Drive / WhatsApp), import.
import { esc, fmtDay, fmtHM, fmtSigned, dayKey } from "../util.js";
import { register, openSheet, closeSheet, current, toast, FLAG_WORD } from "./common.js";
import { exportObject, markExported, parseImport, importReplace, importMerge } from "../store.js";

const FLAG_EMOJI = { green: "🟩", yellow: "🟨", red: "🟥" };

export function summaryText(state, plan) {
  const t = plan.todayPlan;
  const name = state.settings.student.name ? ` · ${state.settings.student.name}` : "";
  const risks = [...plan.subjects].filter((x) => !x.examPassed && x.rem > 0.01).sort((a, b) => b.load - a.load).slice(0, 3)
    .map((x) => `${short(x.name)} ${fmtHM(x.rem).replace(/ \d+m$/, "")} left`).join(" · ");
  const lines = [
    `🏎️ PIT WALL${name} · ${fmtDay(plan.today, true)}`,
    `${FLAG_EMOJI[plan.flag]} ${FLAG_WORD[plan.flag].toUpperCase()} · ${plan.nextExam ? `${plan.lapsToGo} laps to Lights Out (${short(plan.nextExam.name)} ${fmtDay(plan.nextExam.exam)})` : "season complete 🏁"}`,
    `Today: ${fmtHM(t.done)} / ${fmtHM(t.target)}`,
    `Delta: ${fmtSigned(plan.delta)}${plan.ratio > 1 ? ` · needs ${plan.needPerDay.toFixed(1)}h/day` : " · on plan"}`,
    `Last 7 days: ${plan.weekHours.toFixed(1)}h · streak ${plan.streak}`,
    `Chequered: ${plan.totals.chaptersDone}/${plan.totals.chaptersTotal} 🏁`,
    risks ? `Biggest risks: ${risks}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}
const short = (n) => n.replace("Mathematics", "Maths").replace("English Language & Literature", "English");

function renderShare() {
  const { state, plan } = current();
  const text = summaryText(state, plan);
  const canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [new File(["{}"], "x.json", { type: "application/json" })] }));
  return `<h2>📻 Team Radio</h2>
    <div class="tt">WhatsApp summary</div>
    <pre class="card" style="white-space:pre-wrap;font:13px/1.5 var(--pw-font-mono);background:#173326;border-color:#2e5b42">${esc(text)}</pre>
    <div class="btnrow"><button class="btn" data-action="share.whatsapp">Send to WhatsApp</button><button class="btn ghost" data-action="share.copy">Copy text</button></div>
    <div class="checker"></div>
    <div class="tt">Backup file (all progress, as JSON)</div>
    <button class="btn block" data-action="share.exportFile">${canShareFiles ? "⬆ Share backup → Drive / WhatsApp" : "⬇ Download backup file"}</button>
    ${canShareFiles ? `<button class="btn ghost block" data-action="share.download">⬇ Just download it</button>` : `<p class="hint">Then upload the downloaded file to Google Drive or attach it in WhatsApp.</p>`}
    <button class="btn ghost block" data-action="share.importPick">⬇ Import a backup…</button>
    <p class="hint">Last backup: ${state.lastExportAt ? fmtDay(state.lastExportAt, true) : "never"}.</p>`;
}

function backupFile() {
  const json = JSON.stringify(exportObject(), null, 1);
  const name = `pitwall-${dayKey()}.json`;
  return { json, name, file: new File([json], name, { type: "application/json" }) };
}

function download({ json, name }) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function renderImport(fm) {
  const s = fm.summary;
  return `<h2>Import backup</h2>
    <p>File contains <b>${s.subjects}</b> subjects, <b>${s.chapters}</b> chapters and <b>${s.logs}</b> logs${s.name ? ` for <b>${esc(s.name)}</b>` : ""}.</p>
    <button class="btn block" data-action="share.doMerge">Merge into this device (keeps both sets of logs)</button>
    <button class="btn danger block" data-action="share.doReplace">Replace everything on this device</button>
    <button class="btn ghost block" data-action="sheet.close">Cancel</button>`;
}

let pending = null;
register({
  "share.open": () => openSheet(renderShare),
  "share.whatsapp": () => {
    const { state, plan } = current();
    window.open("https://wa.me/?text=" + encodeURIComponent(summaryText(state, plan)), "_blank", "noopener");
  },
  "share.copy": async () => {
    const { state, plan } = current();
    try { await navigator.clipboard.writeText(summaryText(state, plan)); toast("Copied 📋"); }
    catch { toast("Copy blocked: long-press the text to copy"); }
  },
  "share.exportFile": async () => {
    const b = backupFile();
    if (navigator.canShare && navigator.canShare({ files: [b.file] })) {
      try {
        await navigator.share({ files: [b.file], title: "Pit Wall backup", text: "Pit Wall backup " + dayKey() });
        markExported(); closeSheet(); toast("Backup sent 📻");
      } catch (e) { if (e.name !== "AbortError") { download(b); markExported(); toast("Downloaded backup"); } }
    } else { download(b); markExported(); closeSheet(); toast("Backup downloaded. Now put it in Drive"); }
  },
  "share.download": () => { download(backupFile()); markExported(); closeSheet(); toast("Backup downloaded"); },
  "share.importPick": () => {
    const inp = Object.assign(document.createElement("input"), { type: "file", accept: "application/json,.json" });
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const res = parseImport(await f.text());
        pending = res.data;
        if (!current().state) { importReplace(pending); pending = null; toast("Backup restored 🏎"); return; }
        openSheet(renderImport, { summary: res.summary });
      } catch (e) { toast("Couldn't read that file: " + e.message, 4000); }
    };
    inp.click();
  },
  "share.doMerge": () => { importMerge(pending); pending = null; closeSheet(); toast("Merged. Plan updated."); },
  "share.doReplace": () => {
    if (!confirm("Replace all data on this device with the backup?")) return;
    importReplace(pending); pending = null; closeSheet(); toast("Replaced from backup");
  },
});
