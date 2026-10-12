import { CONFIG } from './config.js';
import { wiqlEscape, sleep } from './utils.js';

/* ---------- Auth header ---------- */
export function buildAuthHeader(pat) {
  return 'Basic ' + btoa(':' + pat);
}

/* ---------- Low-level fetch with retry + abort ---------- */
async function fetchJson(url, { method = 'GET', headers = {}, body, signal } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < CONFIG.MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { method, headers, body, signal });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(CONFIG.RETRY_BASE_MS * Math.pow(2, attempt));
        continue;
      }
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      return await res.json();
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      lastErr = e;
      if (attempt < CONFIG.MAX_RETRIES - 1) {
        await sleep(CONFIG.RETRY_BASE_MS * Math.pow(2, attempt));
      }
    }
  }
  throw lastErr;
}

/* ---------- WIQL ---------- */
export async function runWiql(org, pat, query, signal) {
  const url = `https://dev.azure.com/${org}/_apis/wit/wiql?api-version=${CONFIG.WIQL_API_VERSION}`;
  const data = await fetchJson(url, {
    method: 'POST',
    headers: { Authorization: buildAuthHeader(pat), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal,
  });
  return (data.workItems || []).map(w => w.id);
}

/* ---------- Work items (batched, no 100-item cap) ---------- */
export async function getWorkItems(org, pat, ids, signal) {
  if (!ids.length) return [];
  const out = [];
  const batches = [];
  for (let i = 0; i < ids.length; i += CONFIG.WORKITEMS_BATCH_SIZE) {
    batches.push(ids.slice(i, i + CONFIG.WORKITEMS_BATCH_SIZE));
  }
  for (const batch of batches) {
    const url = `https://dev.azure.com/${org}/_apis/wit/workitems?ids=${batch.join(',')}&$expand=none&api-version=${CONFIG.API_VERSION}`;
    const data = await fetchJson(url, {
      headers: { Authorization: buildAuthHeader(pat) },
      signal,
    });
    out.push(...(data.value || []));
  }
  return out;
}

/* ---------- Revisions (single work item) ---------- */
export async function getRevisions(org, pat, workItemId, signal) {
  const url = `https://dev.azure.com/${org}/_apis/wit/workitems/${workItemId}/revisions?api-version=${CONFIG.API_VERSION}`;
  const data = await fetchJson(url, {
    headers: { Authorization: buildAuthHeader(pat) },
    signal,
  });
  return data.value || [];
}

/* ---------- Revision-diff: hours logged today ---------- */
export function computeHoursAddedToday(revisions, todayStr) {
  let hours = 0;
  for (let i = 0; i < revisions.length; i++) {
    const f = revisions[i].fields;
    if (!f) continue;
    const revDate = f['System.ChangedDate']
      ? new Date(f['System.ChangedDate']).toISOString().slice(0, 10)
      : '';
    if (revDate !== todayStr) continue;

    const cur = parseFloat(f['Microsoft.VSTS.Scheduling.CompletedWork'] || 0);
    const prev = i > 0 && revisions[i - 1].fields
      ? parseFloat(revisions[i - 1].fields['Microsoft.VSTS.Scheduling.CompletedWork'] || 0)
      : 0;
    const diff = cur - prev;
    if (diff > 0) hours += diff;
  }
  return hours;
}