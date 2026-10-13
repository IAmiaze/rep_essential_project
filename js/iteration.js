import { CONFIG } from './config.js';
import { buildAuthHeader } from './api.js';

/* ---------- Get current iteration/team settings ---------- */
export async function getCurrentIteration(org, pat, project, team, signal) {
  try {
    // Skip if team is empty or equals the project name
    if (!team || team === project) return null;

    // Skip if team contains a space or is likely an area path, not a team
    if (team.includes(' ') || team.includes('\\')) return null;

    const url = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/teamsettings/iterations?$timeframe=current&api-version=7.1-preview.1`;
    const res = await fetch(url, {
      headers: { Authorization: buildAuthHeader(pat) },
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const it = (data.value || [])[0];
    if (!it) return null;
    return {
      id: it.id,
      name: it.name,
      path: it.path,
      startDate: it.attributes?.startDate,
      finishDate: it.attributes?.finishDate,
      timeFrame: it.attributes?.timeFrame,
    };
  } catch {
    return null;
  }
}

/* ---------- Sprint items count via WIQL ---------- */
export async function getSprintCounts(org, pat, project, iterationPath, signal) {
  const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${project.replace(/'/g, "''")}' AND [System.IterationPath] = '${iterationPath.replace(/'/g, "''")}'`;
  const url = `https://dev.azure.com/${org}/_apis/wit/wiql?api-version=${CONFIG.WIQL_API_VERSION}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: buildAuthHeader(pat),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: wiql }),
      signal,
    });
    if (!res.ok) return { total: 0, ids: [] };
    const data = await res.json();
    const ids = (data.workItems || []).map(w => w.id);
    return { total: ids.length, ids };
  } catch {
    return { total: 0, ids: [] };
  }
}

/* ---------- Days remaining ---------- */
export function daysRemaining(finishDate) {
  if (!finishDate) return null;
  const end = new Date(finishDate);
  const now = new Date();
  const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return diff;
}