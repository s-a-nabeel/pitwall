// notify.js: "Box box" reminder when today's target isn't met by the reminder time.
// Only works while the page/PWA is alive; a static site cannot push when fully closed.
import { current } from "./common.js";
import { uiFlag } from "../store.js";
import { dayKey, fmtHM } from "../util.js";

export async function requestNotify() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

export async function checkReminder() {
  const { state, plan } = current();
  if (!state || !plan || !state.settings.notify) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const today = dayKey();
  if (uiFlag("reminded") === today) return;
  const [hh, mm] = (state.settings.reminderTime || "20:00").split(":").map(Number);
  const now = new Date();
  if (now.getHours() * 60 + now.getMinutes() < hh * 60 + mm) return;
  const t = plan.todayPlan;
  if (t.target <= 0 || t.done >= 0.7 * t.target) return;
  uiFlag("reminded", today);
  const body = `${fmtHM(t.done)} of ${fmtHM(t.target)} done today. ${plan.lapsToGo} laps to Lights Out. One more stint?`;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification("📻 Box box, box box", { body, icon: "icons/icon-192.png", tag: "pitwall-daily" });
    else new Notification("📻 Box box, box box", { body, icon: "icons/icon-192.png" });
  } catch (e) { console.warn("notify failed", e); }
}
