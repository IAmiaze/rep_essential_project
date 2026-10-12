import { CONFIG } from './config.js';
import { isClosedState } from './utils.js';

const LS_PINNED = 'pinned_tasks';
const LS_STREAK = 'work_streak';

/* ---------- Pinned tasks ---------- */
export function getPinned() {
  try {
    return JSON.parse(localStorage.getItem(LS_PINNED) || '[]');
  } catch { return []; }
}

export function togglePin(taskId) {
  const pinned = getPinned();
  const id = String(taskId);
  const idx = pinned.indexOf(id);
  if (idx >= 0) pinned.splice(idx, 1);
  else if (pinned.length < 10) pinned.push(id);
  localStorage.setItem(LS_PINNED, JSON.stringify(pinned));
  return pinned;
}

export function isPinned(taskId) {
  return getPinned().includes(String(taskId));
}

/* ---------- Productivity score ---------- */
/**
 * Score (0–100) blends:
 *   40% — capacity target achieved this week
 *   30% — completed / assigned ratio
 *   30% — active / assigned ratio (penalizes hoarding WIP)
 */
export function computeProductivityScore(tasks) {
  if (!tasks.length) return 0;

  const weekLogged = tasks
    .filter(t => t.isThisWeek)
    .reduce((s, t) => s + (t.totalCompleted || 0), 0);

  const capacityRatio = Math.min(weekLogged / CONFIG.WEEKLY_CAPACITY_HOURS, 1);

  const closed = tasks.filter(t => isClosedState(t.state)).length;
  const closeRatio = closed / tasks.length;

  const active = tasks.length - closed;
  const wipRatio = 1 - Math.min(active / tasks.length, 1);

  const score = capacityRatio * 40 + closeRatio * 30 + wipRatio * 30;
  return Math.round(score);
}

/* ---------- Work streak ---------- */
/**
 * Streak = consecutive days (up to today or yesterday) where the user
 * logged >= daily target hours, using changedDate + totalCompleted as proxy.
 * Persisted per-day so a streak doesn't reset when API returns fewer days.
 */
export function computeStreak(tasks, todayStr) {
  const byDate = new Map();
  tasks.forEach(t => {
    if (!t.changedDate) return;
    byDate.set(
      t.changedDate,
      (byDate.get(t.changedDate) || 0) + (t.totalCompleted || 0)
    );
  });

  const target = CONFIG.DAILY_TARGET_HOURS;
  const today = new Date(todayStr);

  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const logged = byDate.get(key) || 0;

    if (logged >= target) {
      streak++;
    } else if (i === 0) {
      // Today not yet met — check if yesterday continues the streak
      continue;
    } else {
      break;
    }
  }

  // Persist best streak
  const best = Math.max(streak, Number(localStorage.getItem(LS_STREAK) || 0));
  if (streak > 0) localStorage.setItem(LS_STREAK, String(best));

  return { current: streak, best };
}