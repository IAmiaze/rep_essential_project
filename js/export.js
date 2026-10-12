import { getLocalDateString } from './utils.js';

/* ---------- CSV ---------- */
function escapeCsv(value) {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function exportTasksToCsv(tasks, filename = 'tasks') {
  if (!tasks || !tasks.length) {
    Swal.fire({ icon: 'info', title: 'Nothing to export', text: 'No tasks in current view.', timer: 1200, showConfirmButton: false });
    return;
  }

  const headers = [
    'ID', 'Project', 'Team', 'Type', 'Title', 'State',
    'Today Logged (hrs)', 'Total Completed (hrs)', 'Remaining (hrs)',
    'Changed Date', 'URL'
  ];

  const rows = tasks.map(t => [
    t.id, t.project, t.team, t.type, t.title, t.state,
    t.todayLoggedHours || 0,
    t.totalCompleted || 0,
    t.remainingHrs || 0,
    t.changedDate || '',
    t.taskUrl || '',
  ]);

  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map(r => r.map(escapeCsv).join(',')),
  ].join('\r\n');

  downloadBlob(csv, `${filename}_${getLocalDateString()}.csv`, 'text/csv;charset=utf-8');
}

/* ---------- JSON ---------- */
export function exportTasksToJson(tasks, filename = 'tasks') {
  if (!tasks || !tasks.length) {
    Swal.fire({ icon: 'info', title: 'Nothing to export', timer: 1200, showConfirmButton: false });
    return;
  }
  const json = JSON.stringify(tasks, null, 2);
  downloadBlob(json, `${filename}_${getLocalDateString()}.json`, 'application/json');
}

/* ---------- Download helper ---------- */
function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  Swal.fire({
    icon: 'success',
    title: 'Exported',
    text: filename,
    timer: 1200,
    showConfirmButton: false,
  });
}