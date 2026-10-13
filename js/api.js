import { CONFIG } from './config.js';
import { wiqlEscape, sleep, getLocalDateString } from './utils.js';

export function buildAuthHeader(pat) {
  return 'Basic ' + btoa(':' + pat);
}

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

export async function getWorkItems(org, pat, ids, signal) {
  if (!ids.length) return [];
  const out = [];
  const batches = [];
  for (let i = 0; i < ids.length; i += CONFIG.WORKITEMS_BATCH_SIZE) {
    batches.push(ids.slice(i, i + CONFIG.WORKITEMS_BATCH_SIZE));
  }
  for (const batch of batches) {
    const url = `https://dev.azure.com/${org}/_apis/wit/workitems?ids=${batch.join(',')}&$expand=all&api-version=${CONFIG.API_VERSION}`;
    const data = await fetchJson(url, {
      headers: { Authorization: buildAuthHeader(pat) },
      signal,
    });
    out.push(...(data.value || []));
  }
  return out;
}

export async function getRevisions(org, pat, workItemId, signal) {
  const url = `https://dev.azure.com/${org}/_apis/wit/workitems/${workItemId}/revisions?api-version=${CONFIG.API_VERSION}`;
  const data = await fetchJson(url, {
    headers: { Authorization: buildAuthHeader(pat) },
    signal,
  });
  return data.value || [];
}

/* ---------- Smart Attribution ---------- */

function isBacklogOrPlaceholder(iterationPath) {
  if (!iterationPath) return false;
  const lower = iterationPath.toLowerCase();
  return (
    lower.includes('backlog') ||
    lower.includes('unplanned') ||
    lower.includes('placeholder') ||
    lower.includes('unscheduled')
  );
}

export function getAttributionDate(fields, revisions, fallback) {
  const target = fields['Microsoft.VSTS.Scheduling.TargetDate'];
  if (target) return getLocalDateString(new Date(target));

  const finish = fields['Microsoft.VSTS.Scheduling.FinishDate'];
  if (finish) return getLocalDateString(new Date(finish));

  const created = fields['System.CreatedDate'];
  const changed = fields['System.ChangedDate'];
  const iteration = fields['System.IterationPath'] || '';

  // Backlog/placeholder sprint → always use CreatedDate
  if (isBacklogOrPlaceholder(iteration) && created) {
    return getLocalDateString(new Date(created));
  }

  // Old task updated recently (> 60 days)
  if (created && changed) {
    const createdMs = new Date(created).getTime();
    const changedMs = new Date(changed).getTime();
    const daysDiff = (changedMs - createdMs) / (1000 * 60 * 60 * 24);
    if (daysDiff > 60) {
      return getLocalDateString(new Date(created));
    }
  }

  // Last revision where CompletedWork increased
  if (revisions && revisions.length) {
    for (let i = revisions.length - 1; i >= 0; i--) {
      const f = revisions[i].fields;
      if (!f) continue;
      const cur = parseFloat(f['Microsoft.VSTS.Scheduling.CompletedWork'] || 0);
      const prev = i > 0 && revisions[i - 1].fields
        ? parseFloat(revisions[i - 1].fields['Microsoft.VSTS.Scheduling.CompletedWork'] || 0)
        : 0;
      if (cur - prev > 0) {
        return f['System.ChangedDate']
          ? getLocalDateString(new Date(f['System.ChangedDate']))
          : fallback;
      }
    }
  }

  if (changed) return getLocalDateString(new Date(changed));
  return fallback;
}

export function computeAttributedHours(attributionDate, totalCompleted, dateStr) {
  if (!attributionDate || attributionDate !== dateStr) return 0;
  return parseFloat(totalCompleted || 0);
}

export function computeHoursAddedOn() { return 0; }
export function computeHoursAddedToday() { return 0; }

export function computeLastLogDate(revisions, fallbackDate) {
  for (let i = revisions.length - 1; i >= 0; i--) {
    const f = revisions[i].fields;
    if (!f) continue;
    const cur = parseFloat(f['Microsoft.VSTS.Scheduling.CompletedWork'] || 0);
    const prev = i > 0 && revisions[i - 1].fields
      ? parseFloat(revisions[i - 1].fields['Microsoft.VSTS.Scheduling.CompletedWork'] || 0)
      : 0;
    if (cur - prev > 0) {
      return f['System.ChangedDate']
        ? new Date(f['System.ChangedDate']).toISOString().slice(0, 10)
        : fallbackDate;
    }
  }
  return fallbackDate;
}