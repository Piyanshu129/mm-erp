import { regenerateExcelExport } from "./excelExport";

const REGENERATE_INTERVAL_MS = 60_000;

let running = false;

async function tick() {
  if (running) return; // skip if the previous run is still writing (data is small, but never overlap)
  running = true;
  try {
    await regenerateExcelExport();
  } catch (err) {
    console.error("Excel export regeneration failed:", err);
  } finally {
    running = false;
  }
}

// Keeps a live, human-readable Excel mirror of the database (one tab per
// business table) alongside Postgres — not instead of it. A ~60s staleness
// window is a non-issue for a reference/backup artifact at this data scale.
export function startExcelExportScheduler() {
  tick(); // populate the file immediately on startup, don't wait a full interval
  setInterval(tick, REGENERATE_INTERVAL_MS);
}
