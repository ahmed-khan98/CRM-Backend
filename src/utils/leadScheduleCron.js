import { processDueLeadScheduleReminders } from "./notifyLeadSchedule.js";

/**
 * Cron every 15 minutes — light on the server.
 * With a 1-hour reminder window, notification still lands ~45–60 min before schedule.
 */
const INTERVAL_MS = 15 * 60 * 1000;

let running = false;

export function startLeadScheduleReminderCron() {
  const tick = async () => {
    if (running) return; // overlap mat chalao
    running = true;
    try {
      await processDueLeadScheduleReminders();
    } catch (err) {
      console.error("Lead schedule reminder cron failed:", err?.message || err);
    } finally {
      running = false;
    }
  };

  console.log(
    `[lead-schedule-cron] started (every ${INTERVAL_MS / 60000} min, remind 1h before)`,
  );
  tick();
  return setInterval(tick, INTERVAL_MS);
}
