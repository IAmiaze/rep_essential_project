import { CONFIG } from './config.js';
import { buildAuthHeader } from './api.js';

/* ---------- Create Work Item ---------- */
/**
 * Creates a work item of the given type in the specified project.
 * @param {string} org
 * @param {string} pat
 * @param {string} project
 * @param {string} type - e.g., "Task", "Bug", "User Story"
 * @param {Object} fields - map of reference names to values, e.g. { 'System.Title': 'Foo' }
 * @param {AbortSignal} signal
 * @returns {Promise<Object>} the created work item
 */
export async function createWorkItem(org, pat, project, type, fields, signal) {
  const patchDoc = Object.entries(fields).map(([key, value]) => ({
    op: 'add',
    path: `/fields/${key}`,
    value,
  }));

  const url = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/wit/workitems/$${encodeURIComponent(type)}?api-version=${CONFIG.API_VERSION}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: buildAuthHeader(pat),
      'Content-Type': 'application/json-patch+json',
    },
    body: JSON.stringify(patchDoc),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Create failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

/* ---------- Update Work Item ---------- */
/**
 * Updates fields on an existing work item.
 * @param {string} org
 * @param {string} pat
 * @param {number} id
 * @param {Object} fields - map of reference names to new values
 * @param {AbortSignal} signal
 */
export async function updateWorkItem(org, pat, id, fields, signal) {
  const patchDoc = Object.entries(fields).map(([key, value]) => ({
    op: 'replace',
    path: `/fields/${key}`,
    value,
  }));

  const url = `https://dev.azure.com/${org}/_apis/wit/workitems/${id}?api-version=${CONFIG.API_VERSION}`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: buildAuthHeader(pat),
      'Content-Type': 'application/json-patch+json',
    },
    body: JSON.stringify(patchDoc),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Update failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

/* ---------- Convenience: change state ---------- */
export async function changeWorkItemState(org, pat, id, newState, signal) {
  return updateWorkItem(org, pat, id, { 'System.State': newState }, signal);
}

/* ---------- Convenience: log completed work ---------- */
export async function logCompletedWork(org, pat, id, totalHours, signal) {
  return updateWorkItem(
    org,
    pat,
    id,
    { 'Microsoft.VSTS.Scheduling.CompletedWork': Number(totalHours) },
    signal
  );
}

/* ---------- Convenience: add a comment ---------- */
export async function addComment(org, pat, id, text, signal) {
  const url = `https://dev.azure.com/${org}/_apis/wit/workItems/${id}/comments?api-version=7.1-preview.4`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: buildAuthHeader(pat),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Comment failed (${res.status}): ${t.slice(0, 200)}`);
  }
  return res.json();
}