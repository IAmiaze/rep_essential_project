import { escapeHtml, isClosedState, isNewState } from './utils.js';

/* ---------- Skeleton loaders ---------- */
export function showCardSkeletons() {
  const ids = [
    'cardTodayActive','cardTodayHours','cardTodayCompleted','cardTodayTarget',
    'cardWeekHours','cardWeekCapacitySub','cardWeekCapacity','cardWeekRemaining',
    'cardMonthLogged','cardMonthPendingHours','cardMonthActive','cardMonthClosed',
    'cardWeekItems','cardTotalProjects','cardTotalTeams','cardAvgDailyHours',
    'profileTotalTasks','profileActiveTasks','profileClosedTasks','profileTotalHours',
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<span class="skeleton skeleton-text"></span>';
  });
}

export function showTableSkeleton(rows = 8) {
  const tbody = document.getElementById('taskTableBody');
  if (!tbody) return;
  let html = '';
  for (let i = 0; i < rows; i++) {
    html += `<tr class="skeleton-row">${'<td><span class="skeleton skeleton-text"></span></td>'.repeat(10)}</tr>`;
  }
  tbody.innerHTML = html;
}

/* ---------- Empty state ---------- */
export function renderEmptyState(tbody, message, hint = '') {
  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td colspan="10" class="empty-cell">
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">📭</div>
          <div class="empty-title">${escapeHtml(message)}</div>
          ${hint ? `<div class="empty-hint">${escapeHtml(hint)}</div>` : ''}
        </div>
      </td>
    </tr>
  `;
}

/* ---------- Table row builder ---------- */
export function buildTaskRow(task) {
  const closed = isClosedState(task.state);
  const isNew = isNewState(task.state);
  let badgeClass = 'badge-active';
  if (closed) badgeClass = 'badge-closed';
  else if (isNew) badgeClass = 'badge-new';

  // Timelog badge count (from localStorage)
  let todayEntryCount = 0;
  try {
    if (typeof window.getEntriesForTask === 'function') {
      todayEntryCount = window.getEntriesForTask(task.id).length;
    }
  } catch (_) { /* ignore */ }

  const timelogBadge = todayEntryCount > 0
    ? `<span class="timelog-badge" title="${todayEntryCount} entr${todayEntryCount > 1 ? 'ies' : 'y'} today">${todayEntryCount}</span>`
    : '';

  const tr = document.createElement('tr');
  tr.className = 'task-row';
  tr.setAttribute('data-task-id', task.id);
  tr.style.cursor = 'pointer';

  // Row click → open details drawer (unless user clicked a link / button)
  tr.addEventListener('click', (e) => {
    if (e.target.closest('a, button, .pin-btn, .timelog-btn, .task-link')) return;
    if (typeof window.openDetails === 'function') {
      window.openDetails(task.id);
    }
  });

  tr.innerHTML = `
    <td>
      <button
        type="button"
        class="pin-btn ${task._pinned ? 'pinned' : ''}"
        data-pin-id="${task.id}"
        title="${task._pinned ? 'Unpin this task' : 'Pin this task'}"
        aria-label="${task._pinned ? 'Unpin task' : 'Pin task'}"
      >${task._pinned ? '★' : '☆'}</button>
      <a href="${task.taskUrl}" target="_blank" rel="noopener" class="task-link" title="Open Task #${escapeHtml(task.id)} in Azure DevOps">#${escapeHtml(task.id)}</a>
      <button
        type="button"
        class="timelog-btn"
        data-timelog-id="${task.id}"
        title="Log time on this task"
        aria-label="Log time"
      >⏱${timelogBadge}</button>
    </td>
    <td><b>${escapeHtml(task.project)}</b></td>
    <td>${escapeHtml(task.team)}</td>
    <td>${escapeHtml(task.type)}</td>
    <td>${escapeHtml(task.title)}</td>
    <td style="color: #f43f5e; font-weight: bold;">${task.todayLoggedHours > 0 ? '+' + task.todayLoggedHours + ' hrs' : '-'}</td>
    <td>${task.totalCompleted > 0 ? task.totalCompleted + ' hrs' : '-'}</td>
    <td style="color: ${task.remainingHrs > 0 ? '#eab308' : 'inherit'}; font-weight: ${task.remainingHrs > 0 ? 'bold' : 'normal'};">${task.remainingHrs > 0 ? task.remainingHrs + ' hrs' : '-'}</td>
    <td><span class="badge ${badgeClass}">${escapeHtml(task.state)}</span></td>
    <td>${escapeHtml(task.attributionDate || task.changedDate)}</td>
  `;

  return tr;
}