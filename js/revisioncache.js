/**
 * Simple in-memory + sessionStorage cache for work item revisions.
 * Revision data doesn't change often within a session, so this
 * prevents N+1 fetches across dashboard loads.
 */

import { getRevisions } from './api.js';

const memCache = new Map();       // id → revisions[]
const inflight = new Map();       // id → Promise

const SESSION_PREFIX = 'rev_cache_';
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

function sessionKey(id) {
  return SESSION_PREFIX + id;
}

function trySessionCache(id) {
  try {
    const raw = sessionStorage.getItem(sessionKey(id));
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > SESSION_TTL_MS) {
      sessionStorage.removeItem(sessionKey(id));
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function putSessionCache(id, data) {
  try {
    sessionStorage.setItem(sessionKey(id), JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // sessionStorage may be full — silently ignore
  }
}

export async function getCachedRevisions(org, pat, id, signal) {
  if (memCache.has(id)) return memCache.get(id);

  const sessionHit = trySessionCache(id);
  if (sessionHit) {
    memCache.set(id, sessionHit);
    return sessionHit;
  }

  if (inflight.has(id)) return inflight.get(id);

  const p = (async () => {
    try {
      const revs = await getRevisions(org, pat, id, signal);
      memCache.set(id, revs);
      putSessionCache(id, revs);
      return revs;
    } finally {
      inflight.delete(id);
    }
  })();

  inflight.set(id, p);
  return p;
}

export function clearRevisionCache() {
  memCache.clear();
  // Clear session cache
  try {
    const keys = Object.keys(sessionStorage);
    keys.forEach(k => {
      if (k.startsWith(SESSION_PREFIX)) sessionStorage.removeItem(k);
    });
  } catch { /* ignore */ }
}