import { CONFIG } from './config.js';

/* ---------- DOM ---------- */
export const qs  = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- Security ---------- */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Escape single quotes for WIQL string literals */
export function wiqlEscape(str) {
  return String(str || '').replace(/'/g, "''");
}

/* ---------- Dates ---------- */
export function getLocalDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isDateInCurrentWeek(d) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return d >= start && d <= end;
}

/* ---------- State helpers ---------- */
export function isClosedState(state) {
  return CONFIG.CLOSED_STATES.includes(String(state || '').toLowerCase());
}
export function isNewState(state) {
  return CONFIG.NEW_STATES.includes(String(state || '').toLowerCase());
}

/* ---------- Async helpers ---------- */
export function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* Run async tasks with concurrency limit, preserving order */
export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try {
        results[idx] = await worker(items[idx], idx);
      } catch (e) {
        results[idx] = { __error: e };
      }
    }
  });
  await Promise.all(runners);
  return results;
}