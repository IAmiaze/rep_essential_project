/**
 * Per-work-item "log date" overrides.
 * When a user picks a specific date for a task's hours, that overrides
 * every auto-detected value (ChangedDate, TargetDate, etc.).
 *
 * Storage: localStorage['work_item_log_dates'] = { "<id>": "YYYY-MM-DD" }
 */

const LS_KEY = 'work_item_log_dates';
let cache = null;

function loadAll() {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    cache = {};
  }
  return cache;
}

export function getLogDate(workItemId) {
  const all = loadAll();
  return all[String(workItemId)] || null;
}

export function setLogDate(workItemId, dateStr) {
  const all = loadAll();
  if (dateStr) {
    all[String(workItemId)] = dateStr;
  } else {
    delete all[String(workItemId)];
  }
  localStorage.setItem(LS_KEY, JSON.stringify(all));
  cache = all;
  return dateStr;
}

export function clearLogDate(workItemId) {
  setLogDate(workItemId, null);
}

export function clearAllLogDates() {
  localStorage.removeItem(LS_KEY);
  cache = null;
}