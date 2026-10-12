import { getLocalDateString } from './utils.js';

const LS_ENTRIES = 'time_entries';

/* ---------- Storage ---------- */
export function getAllEntries() {
  try {
    return JSON.parse(localStorage.getItem(LS_ENTRIES) || '[]');
  } catch { return []; }
}

export function getEntriesForTask(taskId) {
  return getAllEntries().filter(e => String(e.taskId) === String(taskId));
}

export function getEntriesForToday() {
  const today = getLocalDateString();
  return getAllEntries().filter(e => e.date === today);
}

export function addEntry({ taskId, taskTitle, hours, note = '' }) {
  const entries = getAllEntries();
  const entry = {
    id: 'te_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    taskId: Number(taskId),
    taskTitle: taskTitle || '',
    hours: Number(hours),
    note: String(note || '').slice(0, 200),
    date: getLocalDateString(),
    ts: Date.now(),
    synced: false,
  };
  entries.unshift(entry);
  localStorage.setItem(LS_ENTRIES, JSON.stringify(entries));
  return entry;
}

export function markEntrySynced(entryId) {
  const entries = getAllEntries();
  const idx = entries.findIndex(e => e.id === entryId);
  if (idx >= 0) {
    entries[idx].synced = true;
    localStorage.setItem(LS_ENTRIES, JSON.stringify(entries));
  }
}

export function deleteEntry(entryId) {
  const entries = getAllEntries().filter(e => e.id !== entryId);
  localStorage.setItem(LS_ENTRIES, JSON.stringify(entries));
}

export function getTotalToday() {
  return getEntriesForToday().reduce((s, e) => s + (e.hours || 0), 0);
}

/* ---------- Modal UI ---------- */
export function openTimeLogModal(task) {
  const todayEntries = getEntriesForTask(task.id);
  const totalLogged = todayEntries.reduce((s, e) => s + e.hours, 0);

  const entriesHtml = todayEntries.length
    ? `<div class="timelog-existing">
        <div class="timelog-existing-title">Already logged today: <strong>${totalLogged.toFixed(1)} hrs</strong></div>
        ${todayEntries.map(e => `
          <div class="timelog-entry">
            <span>${e.hours} hrs ${e.note ? '— ' + escapeHtml(e.note) : ''}</span>
            <button type="button" onclick="removeTimeEntry('${e.id}')" class="timelog-remove" title="Delete">×</button>
          </div>
        `).join('')}
      </div>`
    : '';

  Swal.fire({
    title: `Log Time — #${task.id}`,
    html: `
      <div style="text-align:left; font-family: inherit;">
        <div style="font-size:13px; color:#94a3b8; margin-bottom:14px;">${escapeHtml(task.title)}</div>
        ${entriesHtml}
        <label style="display:block; font-size:12px; font-weight:600; color:#94a3b8; margin-bottom:6px; margin-top:14px;">Hours to log</label>
        <input id="timelogHours" type="number" min="0.25" max="24" step="0.25" value="1" style="width:100%; padding:10px; border-radius:6px; border:1px solid #334155; background:#334155; color:#f8fafc; font-size:14px;">
        <label style="display:block; font-size:12px; font-weight:600; color:#94a3b8; margin-bottom:6px; margin-top:12px;">Note (optional)</label>
        <input id="timelogNote" type="text" maxlength="200" placeholder="e.g., Implemented login flow" style="width:100%; padding:10px; border-radius:6px; border:1px solid #334155; background:#334155; color:#f8fafc; font-size:14px;">
        <div style="font-size:11px; color:#64748b; margin-top:12px;">
          💡 Tip: Click <strong>Push to ADO</strong> on the main screen to sync these hours to <code>CompletedWork</code>.
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Log Hours',
    confirmButtonColor: '#0284c7',
    cancelButtonColor: '#475569',
    focusConfirm: false,
    preConfirm: () => {
      const hours = parseFloat(document.getElementById('timelogHours').value);
      const note = document.getElementById('timelogNote').value.trim();
      if (!hours || hours <= 0 || hours > 24) {
        Swal.showValidationMessage('Enter 1 to 24 hours');
        return false;
      }
      return { hours, note };
    },
  }).then(result => {
    if (!result.isConfirmed) return;
    addEntry({ taskId: task.id, taskTitle: task.title, hours: result.value.hours, note: result.value.note });
    Swal.fire({
      icon: 'success',
      title: 'Logged!',
      text: `${result.value.hours} hrs added to #${task.id}`,
      timer: 1200,
      showConfirmButton: false,
    });
    // Refresh the timelog button badge on the row (if exposed)
    if (typeof window.refreshTimelogBadges === 'function') window.refreshTimelogBadges();
  });
}

/* ---------- Helpers ---------- */
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}