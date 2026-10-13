import { buildAuthHeader } from './api.js';
import { CONFIG } from './config.js';
import { escapeHtml, isClosedState, getLocalDateString } from './utils.js';
import { getLogDate, setLogDate } from './logdates.js';

export async function fetchWorkItemDetails(org, pat, id, signal) {
  const url = `https://dev.azure.com/${org}/_apis/wit/workitems/${id}?$expand=all&api-version=${CONFIG.API_VERSION}`;
  const res = await fetch(url, {
    headers: { Authorization: buildAuthHeader(pat) },
    signal,
  });
  if (!res.ok) throw new Error(`Failed to fetch item #${id}`);
  return res.json();
}

let currentItem = null;

export function renderDetailsDrawer(item, org) {
  const drawer = document.getElementById('detailsDrawer');
  if (!drawer) return;

  currentItem = item;

  const f = item.fields || {};
  const project = f['System.TeamProject'] || '';
  const state = f['System.State'] || 'Unknown';
  const closed = isClosedState(state);

  const stateClass = closed ? 'badge-closed' :
    ['new', 'to do', 'proposed', 'not started'].includes(state.toLowerCase())
      ? 'badge-new' : 'badge-active';

  const assigned = f['System.AssignedTo'];
  const assignedName = typeof assigned === 'object' ? assigned.displayName : assigned || '—';
  const assignedAvatar = typeof assigned === 'object' && assigned.imageUrl
    ? `<img src="${assigned.imageUrl}" alt="" class="drawer-avatar">`
    : '';

  const tags = (f['System.Tags'] || '').split(';').map(t => t.trim()).filter(Boolean);
  const priority = f['Microsoft.VSTS.Common.Priority'];
  const description = f['System.Description'] || '';
  const acceptance = f['Microsoft.VSTS.Common.AcceptanceCriteria'] || '';
  const repro = f['Microsoft.VSTS.TCM.ReproSteps'] || '';

  const originalEstimate = parseFloat(f['Microsoft.VSTS.Scheduling.OriginalEstimate'] || 0);
  const completedWork = parseFloat(f['Microsoft.VSTS.Scheduling.CompletedWork'] || 0);
  const remainingWork = parseFloat(f['Microsoft.VSTS.Scheduling.RemainingWork'] || 0);
  const completedPct = originalEstimate > 0
    ? Math.min(Math.round((completedWork / originalEstimate) * 100), 100)
    : (closed ? 100 : 0);

  const workItemUrl = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_workitems/edit/${item.id}`;
  const currentLogDate = getLogDate(item.id) || '';

  drawer.innerHTML = `
    <div class="drawer-header">
      <div>
        <div class="drawer-eyebrow">#${escapeHtml(item.id)} · ${escapeHtml(f['System.WorkItemType'] || 'Task')}</div>
        <h3 class="drawer-title">${escapeHtml(f['System.Title'] || 'Untitled')}</h3>
      </div>
      <div class="drawer-header-actions">
        <button type="button" class="btn-edit" onclick="toggleDrawerEditMode()" title="Edit this task">✏️ Edit</button>
        <button type="button" class="drawer-close" onclick="closeDetailsDrawer()" aria-label="Close">×</button>
      </div>
    </div>

    <div class="drawer-body">

      <div id="drawerEditForm" class="drawer-edit-form" style="display:none;">

        <div class="edit-row edit-row-logdate">
          <label for="drawerEditLogDate">📅 Log Date <span style="color:#94a3b8;font-size:11px;font-weight:400;">(which day do these hours belong to?)</span></label>
          <input type="date" id="drawerEditLogDate" value="${currentLogDate || getLocalDateString()}">
          <div class="edit-hint-inline">Change this if you're logging hours for a previous date. It overrides the automatic date detection.</div>
        </div>

        <div class="edit-row">
          <label for="drawerEditState">State</label>
          <select id="drawerEditState">
            <option value="">— unchanged —</option>
            <option value="New">New</option>
            <option value="Active">Active</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
            <option value="Removed">Removed</option>
          </select>
        </div>

        <div class="edit-row">
          <label for="drawerEditOriginal">Original Estimate (hrs)</label>
          <input type="number" id="drawerEditOriginal" min="0" max="1000" step="0.25" value="${originalEstimate || 0}">
        </div>

        <div class="edit-row">
          <label for="drawerEditCompleted">Completed Work (hrs)</label>
          <input type="number" id="drawerEditCompleted" min="0" max="1000" step="0.25" value="${completedWork || 0}">
        </div>

        <div class="edit-row">
          <label for="drawerEditRemaining">Remaining Work (hrs)</label>
          <input type="number" id="drawerEditRemaining" min="0" max="1000" step="0.25" value="${remainingWork || 0}">
        </div>

        <div class="edit-row edit-row-textarea">
          <label for="drawerEditDescription">Description <span style="color:#f43f5e;" id="drawerEditDescHint"></span></label>
          <textarea id="drawerEditDescription" rows="4" maxlength="4000" placeholder="Describe the work..."></textarea>
        </div>

        <div class="edit-row edit-row-textarea">
          <label for="drawerEditComment">Add Comment (optional)</label>
          <textarea id="drawerEditComment" rows="3" maxlength="500" placeholder="Progress note..."></textarea>
        </div>

        <div class="edit-actions">
          <button type="button" class="btn btn-secondary" onclick="toggleDrawerEditMode()">Cancel</button>
          <button type="button" class="btn" onclick="saveDrawerEdit()">💾 Save</button>
        </div>
        <div class="edit-hint">💡 Tip: press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to save quickly.</div>
      </div>

      <div id="drawerViewMode">

        <div class="drawer-badges">
          <span class="badge ${stateClass}">${escapeHtml(state)}</span>
          ${priority ? `<span class="badge badge-priority">P${escapeHtml(priority)}</span>` : ''}
          ${tags.map(t => `<span class="badge badge-tag">${escapeHtml(t)}</span>`).join('')}
        </div>

        ${currentLogDate ? `
          <div class="drawer-logdate-badge">
            📅 Hours attributed to: <strong>${escapeHtml(currentLogDate)}</strong>
            <button type="button" class="drawer-logdate-clear" onclick="clearDrawerLogDate()" title="Clear (use ADO's date)">×</button>
          </div>` : ''}

        <div class="drawer-hours">
          <div class="drawer-hours-bar-wrap">
            <div class="drawer-hours-bar">
              <div class="drawer-hours-fill" style="width:${completedPct}%"></div>
            </div>
            <div class="drawer-hours-pct">${completedPct}%</div>
          </div>
          <div class="drawer-hours-grid">
            <div class="drawer-hours-cell">
              <span class="drawer-hours-label">Original Est.</span>
              <strong>${originalEstimate} hrs</strong>
            </div>
            <div class="drawer-hours-cell">
              <span class="drawer-hours-label">Completed</span>
              <strong class="highlight-green">${completedWork} hrs</strong>
            </div>
            <div class="drawer-hours-cell">
              <span class="drawer-hours-label">Remaining</span>
              <strong class="highlight-yellow">${remainingWork} hrs</strong>
            </div>
          </div>
        </div>

        <div class="drawer-meta">
          <div class="drawer-field">
            <span class="drawer-label">Assigned To</span>
            <div class="drawer-value drawer-user">
              ${assignedAvatar}
              <span>${escapeHtml(assignedName)}</span>
            </div>
          </div>
          <div class="drawer-field">
            <span class="drawer-label">Project</span>
            <div class="drawer-value">${escapeHtml(project)}</div>
          </div>
          <div class="drawer-field">
            <span class="drawer-label">Area Path</span>
            <div class="drawer-value">${escapeHtml(f['System.AreaPath'] || '—')}</div>
          </div>
          <div class="drawer-field">
            <span class="drawer-label">Iteration</span>
            <div class="drawer-value">${escapeHtml(f['System.IterationPath'] || '—')}</div>
          </div>
        </div>

        ${description ? `
          <div class="drawer-section">
            <h5>📄 Description</h5>
            <div class="drawer-html">${description}</div>
          </div>` : ''}

        ${acceptance ? `
          <div class="drawer-section">
            <h5>✅ Acceptance Criteria</h5>
            <div class="drawer-html">${acceptance}</div>
          </div>` : ''}

        ${repro ? `
          <div class="drawer-section">
            <h5>🐛 Repro Steps</h5>
            <div class="drawer-html">${repro}</div>
          </div>` : ''}

        <div class="drawer-actions">
          <a href="${workItemUrl}" target="_blank" rel="noopener" class="btn">🔗 Open in Azure DevOps</a>
          <button type="button" class="btn btn-secondary" onclick="copyToClipboard('${item.id}')">📋 Copy ID</button>
        </div>
      </div>
    </div>
  `;

  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
}

export function toggleDrawerEditMode() {
  const editForm = document.getElementById('drawerEditForm');
  const viewMode = document.getElementById('drawerViewMode');
  if (!editForm || !viewMode) return;

  const isEditing = editForm.style.display !== 'none';

  if (!isEditing) {
    const logDateEl = document.getElementById('drawerEditLogDate');
    if (logDateEl && currentItem) {
      logDateEl.value = getLogDate(currentItem.id) || getLocalDateString();
    }
    const descEl = document.getElementById('drawerEditDescription');
    if (descEl && currentItem) {
      const raw = currentItem.fields['System.Description'] || '';
      descEl.value = htmlToPlain(raw);
    }
    updateDescHint();
    const stateDD = document.getElementById('drawerEditState');
    if (stateDD) stateDD.onchange = updateDescHint;
  }

  editForm.style.display = isEditing ? 'none' : 'block';
  viewMode.style.display = isEditing ? 'block' : 'none';
}

function updateDescHint() {
  const stateDD = document.getElementById('drawerEditState');
  const hint = document.getElementById('drawerEditDescHint');
  if (!stateDD || !hint) return;
  const newState = stateDD.value;
  const needsDesc = newState === 'Closed' || newState === 'Resolved';
  hint.textContent = needsDesc ? '(required for this state)' : '';
}

function htmlToPlain(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

export async function saveDrawerEdit() {
  if (!currentItem) return;
  const workItemId = currentItem.id;

  const org = localStorage.getItem('azure_org');
  const pat = localStorage.getItem('azure_pat');
  if (!org || !pat) return;

  const newState = document.getElementById('drawerEditState').value;
  const originalEst = document.getElementById('drawerEditOriginal').value;
  const completed = document.getElementById('drawerEditCompleted').value;
  const remaining = document.getElementById('drawerEditRemaining').value;
  const description = document.getElementById('drawerEditDescription').value.trim();
  const comment = document.getElementById('drawerEditComment').value.trim();
  const logDate = document.getElementById('drawerEditLogDate').value;

  const currentState = currentItem.fields['System.State'] || '';
  const currentDescRaw = currentItem.fields['System.Description'] || '';
  const currentDescPlain = htmlToPlain(currentDescRaw).trim();
  const currentOriginal = parseFloat(currentItem.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] || 0);
  const currentCompleted = parseFloat(currentItem.fields['Microsoft.VSTS.Scheduling.CompletedWork'] || 0);
  const currentRemaining = parseFloat(currentItem.fields['Microsoft.VSTS.Scheduling.RemainingWork'] || 0);

  const willClose = newState === 'Closed' || newState === 'Resolved';
  const fields = {};

  if (newState && newState !== currentState) fields['System.State'] = newState;
  if (originalEst !== '' && parseFloat(originalEst) !== currentOriginal) {
    fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] = parseFloat(originalEst);
  }
  if (completed !== '' && parseFloat(completed) !== currentCompleted) {
    fields['Microsoft.VSTS.Scheduling.CompletedWork'] = parseFloat(completed);
  }
  if (remaining !== '' && parseFloat(remaining) !== currentRemaining && !willClose) {
    const remVal = parseFloat(remaining);
    if (remVal >= 0) fields['Microsoft.VSTS.Scheduling.RemainingWork'] = remVal;
  }
  if (fields['System.State'] && currentOriginal === 0 && !fields['Microsoft.VSTS.Scheduling.OriginalEstimate']) {
    fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] = parseFloat(originalEst) || 1;
  }
  if (description && description !== currentDescPlain) {
    fields['System.Description'] = description.replace(/\n/g, '<br>');
  } else if (willClose && !currentDescPlain && !description) {
    Swal.fire({
      icon: 'warning', title: 'Description Required',
      text: 'Your project requires a Description when closing a work item.',
      confirmButtonColor: '#0284c7',
    });
    document.getElementById('drawerEditDescription')?.focus();
    return;
  }

  if (logDate) setLogDate(workItemId, logDate);

  Swal.fire({ title: 'Saving…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    if (Object.keys(fields).length > 0) {
      const patchDoc = Object.entries(fields).map(([key, value]) => ({
        op: 'add', path: `/fields/${key}`, value,
      }));

      const res = await fetch(
        `https://dev.azure.com/${org}/_apis/wit/workitems/${workItemId}?api-version=${CONFIG.API_VERSION}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: buildAuthHeader(pat),
            'Content-Type': 'application/json-patch+json',
          },
          body: JSON.stringify(patchDoc),
        }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        let msg = `Update failed (${res.status})`;
        try {
          const parsed = JSON.parse(txt);
          if (parsed.customProperties?.ErrorMessage) msg = parsed.customProperties.ErrorMessage;
          else if (parsed.message) msg = parsed.message;
        } catch (_) { msg += ': ' + txt.slice(0, 300); }
        throw new Error(msg);
      }
    }

    if (comment) {
      const cRes = await fetch(
        `https://dev.azure.com/${org}/_apis/wit/workItems/${workItemId}/comments?api-version=7.1-preview.4`,
        {
          method: 'POST',
          headers: { Authorization: buildAuthHeader(pat), 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: comment }),
        }
      );
      if (!cRes.ok) console.warn('Comment failed but update succeeded');
    }

    Swal.fire({
      icon: 'success',
      title: 'Saved',
      html: `Work item <strong>#${workItemId}</strong> updated.<br>Hours attributed to <strong>${logDate}</strong>.`,
      timer: 1800,
      showConfirmButton: false,
    });

    setTimeout(() => {
      if (typeof window.openDetails === 'function') window.openDetails(workItemId);
      if (typeof window.refreshDashboard === 'function') window.refreshDashboard();
    }, 300);

  } catch (err) {
    Swal.fire({
      icon: 'error', title: 'Save Failed', text: err.message,
      confirmButtonColor: '#0284c7',
    });
  }
}

export function closeDetailsDrawer() {
  const drawer = document.getElementById('detailsDrawer');
  if (!drawer) return;
  
  // Move focus away BEFORE hiding
  const focused = document.activeElement;
  if (focused && drawer.contains(focused)) {
    focused.blur();
  }
  
  drawer.classList.remove('open');
  // Delay aria-hidden until transition finishes
  setTimeout(() => {
    drawer.setAttribute('aria-hidden', 'true');
  }, 260);  // matches the CSS transition duration
  currentItem = null;
}

export function clearDrawerLogDate() {
  if (!currentItem) return;
  setLogDate(currentItem.id, null);
  const org = localStorage.getItem('azure_org');
  if (currentItem) renderDetailsDrawer(currentItem, org);
  if (typeof window.refreshDashboard === 'function') window.refreshDashboard();
}