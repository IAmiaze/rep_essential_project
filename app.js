//Versioned 1.0.3
import { CONFIG } from './js/config.js';
import {
  qs, qsa, escapeHtml, wiqlEscape,
  getLocalDateString, isDateInCurrentWeek,
  isClosedState, isNewState,
  mapWithConcurrency,
} from './js/utils.js';
import {
  runWiql, getWorkItems,
  getAttributionDate, computeAttributedHours,
} from './js/api.js';
import { state, setAbortController } from './js/state.js';
import { initKeyboardShortcuts } from './js/keyboard.js';
import { showCardSkeletons, showTableSkeleton, renderEmptyState, buildTaskRow } from './js/render.js';
import { renderAnalytics, renderAnalyticsBig } from './js/charts.js';
import {
  getPinned, togglePin,
  computeProductivityScore, computeStreak,
} from './js/productivity.js';
import {
  initPomodoro, pomodoroStart, pomodoroPause, pomodoroReset, pomodoroRequestPermission,
} from './js/pomodoro.js';
import {
  openSettings, closeSettings,
  saveSettingsFromForm, resetSettingsFromForm,
  runDailyChecks,
} from './js/settings.js';
import { getCurrentIteration, getSprintCounts, daysRemaining } from './js/iteration.js';
import {
  fetchWorkItemDetails, renderDetailsDrawer, closeDetailsDrawer,
  toggleDrawerEditMode, saveDrawerEdit, clearDrawerLogDate,
} from './js/details.js';
import { exportTasksToCsv, exportTasksToJson } from './js/export.js';
import {
  openTimeLogModal, getEntriesForTask, getAllEntries, getTotalToday,
  deleteEntry,
} from './js/timetracking.js';
import {
  updateWorkItem, addComment,
} from './js/workitems.js';
import { initDateFilter, computeRange, isInRange } from './js/datefilter.js';
import { getCachedRevisions, clearRevisionCache } from './js/revisioncache.js';
import { initTopTabs } from './js/toptabs.js';
import { getLogDate } from './js/logdates.js';

/* ============================================================
   PINNED TASKS
   ============================================================ */
function toggleTaskPin(taskId) {
  togglePin(taskId);
  markPinned();
  applyFilters();
}

function markPinned() {
  const set = new Set(getPinned());
  const decorate = list => list.forEach(t => { t._pinned = set.has(String(t.id)); });
  decorate(state.allFetchedTasks);
  decorate(state.backlogTasks);
}

/* ============================================================
   THEME
   ============================================================ */
function initTheme() {
  const savedTheme = localStorage.getItem(CONFIG.LS.THEME) || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeButtons(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem(CONFIG.LS.THEME, newTheme);
  updateThemeButtons(newTheme);
}

function updateThemeButtons(theme) {
  const btnText = theme === 'dark' ? '☀️' : '🌙';
  const loginBtn = qs('#loginThemeBtn');
  const dashBtn = qs('#dashThemeBtn');
  if (loginBtn) loginBtn.innerText = btnText;
  if (dashBtn) dashBtn.innerText = btnText;
}

/* ============================================================
   BOOTSTRAP
   ============================================================ */
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initKeyboardShortcuts({ switchTab, refresh: refreshDashboard, applyFilters });
  initPomodoro();
  initTopTabs(() => {});

  // Pin delegation
  document.addEventListener('click', (e) => {
    const pinBtn = e.target.closest('.pin-btn');
    if (!pinBtn) return;
    e.stopPropagation();
    e.preventDefault();
    const id = pinBtn.getAttribute('data-pin-id');
    if (id) toggleTaskPin(Number(id));
  });

  // Timelog delegation
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.timelog-btn');
    if (!btn) return;
    e.stopPropagation();
    e.preventDefault();
    const id = btn.getAttribute('data-timelog-id');
    if (!id) return;
    const task = state.currentFilteredTasks.find(t => String(t.id) === String(id))
              || state.allFetchedTasks.find(t => String(t.id) === String(id));
    if (task) openTimeLogModal(task);
  });

  // Overlay click closes modals
  document.addEventListener('click', (e) => {
    if (!e.target.classList.contains('modal-overlay')) return;
    const id = e.target.id;
    if (id === 'settingsModal') closeSettings();
    if (id === 'updateTaskModal') closeUpdateTaskModal();
  });

  // Ctrl+Enter saves drawer edit
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const editForm = document.getElementById('drawerEditForm');
      if (editForm && editForm.style.display !== 'none') {
        e.preventDefault();
        if (typeof window.saveDrawerEdit === 'function') window.saveDrawerEdit();
      }
    }
  });

  initDateFilter(() => { applyFilters(); });

  const savedOrg = localStorage.getItem(CONFIG.LS.ORG);
  const savedEmail = localStorage.getItem(CONFIG.LS.EMAIL);
  const savedPat = localStorage.getItem(CONFIG.LS.PAT);

  if (savedOrg && savedEmail && savedPat) {
    qs('#orgName').value = savedOrg;
    qs('#userEmail').value = savedEmail;
    qs('#patToken').value = savedPat;
    fetchUserTasks(savedOrg, savedEmail, savedPat);
  }

  registerServiceWorker();
  setupPwaInstall();
});

/* ============================================================
   PWA
   ============================================================ */
let deferredInstallPrompt = null;

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    console.log('[PWA] Service Worker registered:', reg.scope);
  }).catch(err => console.warn('[PWA] SW failed:', err));
}

function setupPwaInstall() {
  const installBtn = qs('#installBtn');
  if (!installBtn) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installBtn.style.display = 'inline-flex';
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installBtn.style.display = 'none';
    Swal.fire({ icon: 'success', title: 'App Installed', timer: 2500, showConfirmButton: false });
  });
}

async function installPwa() {
  if (!deferredInstallPrompt) {
    Swal.fire({ icon: 'info', title: 'Install not available', confirmButtonColor: '#0284c7' });
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  const btn = qs('#installBtn');
  if (btn) btn.style.display = 'none';
}

/* ============================================================
   LOGIN / LOGOUT
   ============================================================ */
function handleLogin() {
  const org = qs('#orgName').value.trim();
  const email = qs('#userEmail').value.trim();
  const pat = qs('#patToken').value.trim();
  const remember = qs('#rememberMe') ? qs('#rememberMe').checked : false;

  if (!org || !email || !pat) {
    Swal.fire({ icon: 'warning', title: 'Missing Fields', confirmButtonColor: '#0284c7' });
    return;
  }

  if (remember) {
    localStorage.setItem(CONFIG.LS.ORG, org);
    localStorage.setItem(CONFIG.LS.EMAIL, email);
    localStorage.setItem(CONFIG.LS.PAT, pat);
  } else {
    localStorage.removeItem(CONFIG.LS.ORG);
    localStorage.removeItem(CONFIG.LS.EMAIL);
    localStorage.removeItem(CONFIG.LS.PAT);
  }

  fetchUserTasks(org, email, pat);
}

function logout() {
  Swal.fire({
    title: 'Are you sure?',
    text: 'You will be logged out and cached credentials cleared.',
    icon: 'question', showCancelButton: true,
    confirmButtonColor: '#ef4444', cancelButtonColor: '#475569',
    confirmButtonText: 'Yes, Logout',
  }).then(result => {
    if (!result.isConfirmed) return;
    localStorage.removeItem(CONFIG.LS.ORG);
    localStorage.removeItem(CONFIG.LS.EMAIL);
    localStorage.removeItem(CONFIG.LS.PAT);
    clearRevisionCache();
    qs('#dashboardSection').style.display = 'none';
    qs('#loginSection').style.display = 'block';
    state.allFetchedTasks = [];
    state.backlogTasks = [];
    state.currentFilteredTasks = [];
    Swal.fire({ icon: 'success', title: 'Logged Out', timer: 1200, showConfirmButton: false });
  });
}

/* ============================================================
   MAIN FETCH — progressive loading
   ============================================================ */
async function fetchUserTasks(org, email, pat) {
  Swal.fire({
    title: 'Connecting to Azure DevOps',
    text: 'Fetching work items...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  qs('#loginSection').style.display = 'none';
  qs('#dashboardSection').style.display = 'block';
  qs('#userDisplay').innerText = `User: ${email} | Org: ${org}`;

  updateProfileUI(email, org);
  showCardSkeletons();
  showTableSkeleton(8);

  const signal = setAbortController().signal;

  try {
    /* PHASE 1 — Fast path: IDs + work items only */
    const wiqlQuery = `SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] CONTAINS '${wiqlEscape(email)}' ORDER BY [System.ChangedDate] DESC`;
    const ids = await runWiql(org, pat, wiqlQuery, signal);

    if (ids.length === 0) {
      Swal.close();
      qs('#taskTableBody').innerHTML =
        '<tr><td colspan="10" style="text-align:center; padding:25px;">No assigned tasks found.</td></tr>';
      calculateOverallStats();
      return;
    }

    const fetchedItems = await getWorkItems(org, pat, ids, signal);

    const todayStr = getLocalDateString();
    const currentYearMonth = todayStr.substring(0, 7);
    state.projectTeamsMap = {};

    const tasksFast = fetchedItems.map(item => {
      const fields = item.fields || {};
      const changedDateObj = fields['System.ChangedDate']
        ? new Date(fields['System.ChangedDate']) : new Date();
      const changedDateStr = fields['System.ChangedDate'] ? getLocalDateString(changedDateObj) : '';

      const project = fields['System.TeamProject'] || 'N/A';
      const areaPath = fields['System.AreaPath'] || project;
      const team = areaPath.includes('\\') ? areaPath.split('\\').pop() : project;

      if (!state.projectTeamsMap[project]) state.projectTeamsMap[project] = new Set();
      state.projectTeamsMap[project].add(team);

      const assigned = fields['System.AssignedTo'];
      const assignedTo = typeof assigned === 'object'
        ? (assigned.displayName || assigned.uniqueName || 'Unknown')
        : (assigned || 'Unknown');

      const directTaskUrl = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_workitems/edit/${item.id}`;

      const userLogDate = getLogDate(item.id);
      const attributionDate = userLogDate || getAttributionDate(fields, [], changedDateStr);

      const totalCompleted = parseFloat(fields['Microsoft.VSTS.Scheduling.CompletedWork'] || 0);

      return {
        id: item.id,
        project, team,
        type: fields['System.WorkItemType'] || 'Task',
        title: fields['System.Title'] || 'Untitled',
        state: fields['System.State'] || 'Unknown',
        changedDate: changedDateStr,
        lastLogDate: attributionDate,
        attributionDate,
        _userLogDate: !!userLogDate,
        _revisionsLoaded: false,
        assignedTo,
        todayLoggedHours: computeAttributedHours(attributionDate, totalCompleted, todayStr),
        totalCompleted,
        remainingHrs: parseFloat(fields['Microsoft.VSTS.Scheduling.RemainingWork'] || 0),
        isToday: attributionDate === todayStr,
        isThisWeek: isDateInCurrentWeek(new Date(attributionDate)),
        isThisMonth: attributionDate.startsWith(currentYearMonth),
        taskUrl: directTaskUrl,
        _rawFields: fields,
      };
    });

    state.allFetchedTasks = tasksFast;
    markPinned();

    populateProjectFilter();
    populateTypeFilter();
    populateStatusFilter();
    const todayStats = calculateOverallStats();
    renderAnalytics(state.allFetchedTasks);
    renderAnalyticsBig(state.allFetchedTasks);
    updateProductivityPanel();
    applyFilters();

    runDailyChecks(todayStats);

    const widget = qs('#pomodoroWidget');
    if (widget) widget.style.display = 'block';
    pomodoroRequestPermission();

    loadSprintSummary();

    Swal.fire({
      icon: 'success',
      title: 'Dashboard Ready',
      text: `Loaded ${state.allFetchedTasks.length} items. Refining dates in the background…`,
      timer: 1500,
      showConfirmButton: false,
    });

    /* PHASE 2 — Background: fetch revisions, refine attribution */
    refineTasksInBackground(org, pat, signal, todayStr, currentYearMonth);

  } catch (err) {
    if (err.name === 'AbortError') return;
    Swal.fire({
      icon: 'error',
      title: 'Authentication / API Error',
      text: err.message,
      confirmButtonColor: '#0284c7',
    });
    qs('#loginSection').style.display = 'block';
    qs('#dashboardSection').style.display = 'none';
    state.allFetchedTasks = [];
    state.backlogTasks = [];
  }
}

/* ============================================================
   BACKGROUND REFINEMENT
   ============================================================ */
async function refineTasksInBackground(org, pat, signal, todayStr, currentYearMonth) {
  const tasks = state.allFetchedTasks;
  let completed = 0;
  const total = tasks.length;

  const cardSub = qs('#cardTodayHours')?.parentElement?.querySelector('.sub-value');

  await mapWithConcurrency(tasks, CONFIG.REVISION_CONCURRENCY, async (task) => {
    if (signal && signal.aborted) return;
    try {
      const revisions = await getCachedRevisions(org, pat, task.id, signal);
      const fields = task._rawFields || {};

      const userLogDate = getLogDate(task.id);
      const attributionDate = userLogDate || getAttributionDate(fields, revisions, task.changedDate);

      task.attributionDate = attributionDate;
      task.lastLogDate = attributionDate;
      task._revisionsLoaded = true;

      const totalCompleted = parseFloat(fields['Microsoft.VSTS.Scheduling.CompletedWork'] || 0);
      task.todayLoggedHours = computeAttributedHours(attributionDate, totalCompleted, todayStr);
      task.isToday = attributionDate === todayStr;
      task.isThisWeek = isDateInCurrentWeek(new Date(attributionDate));
      task.isThisMonth = attributionDate.startsWith(currentYearMonth);
    } catch (_) { /* skip */ }

    completed++;

    if (completed % 5 === 0 || completed === total) {
      if (cardSub) cardSub.textContent = `Refining… ${completed}/${total}`;
    }
  });

  if (signal && signal.aborted) return;

  // Reset subtitle back to normal
  if (cardSub) {
    cardSub.textContent = 'Belongs to today';
    delete cardSub.dataset.refined;
  }

  calculateOverallStats();
  renderAnalytics(state.allFetchedTasks);
  renderAnalyticsBig(state.allFetchedTasks);
  updateProductivityPanel();
  applyFilters();

  console.log('[Dashboard] Background refinement complete — cards updated with final attribution.');
}

/* ============================================================
   PROFILE UI
   ============================================================ */
function updateProfileUI(email, org) {
  const namePart = email.split('@')[0].replace('.', ' ');
  const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
  const initials = namePart.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const setTxt = (id, val) => { const el = qs('#' + id); if (el) el.innerText = val; };

  setTxt('profileName', formattedName);
  setTxt('profileEmail', email);
  setTxt('profileAvatar', initials || 'AZ');
  setTxt('profileOrg', org);

  setTxt('sideProfileName', formattedName);
  setTxt('sideProfileEmail', email);
  setTxt('sideProfileAvatar', initials || 'AZ');
  setTxt('sideProfileOrg', org);
}

/* ============================================================
   BACKLOG
   ============================================================ */
async function fetchTeamBacklog() {
  const org = localStorage.getItem(CONFIG.LS.ORG) || qs('#orgName').value.trim();
  const pat = localStorage.getItem(CONFIG.LS.PAT) || qs('#patToken').value.trim();
  const selectedProject = qs('#projectFilter').value;

  if (selectedProject === 'ALL') {
    Swal.fire({
      icon: 'info', title: 'Select Specific Project',
      text: 'Please select a specific Project to load its Team Backlog.',
      confirmButtonColor: '#0284c7',
    });
    return;
  }

  Swal.fire({ title: 'Loading Backlog', text: `Fetching ${selectedProject}...`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  const signal = setAbortController().signal;

  try {
    const wiqlQuery = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${wiqlEscape(selectedProject)}' AND [System.State] NOT IN ('Closed', 'Completed', 'Done', 'Removed') ORDER BY [System.ChangedDate] DESC`;
    const ids = await runWiql(org, pat, wiqlQuery, signal);

    if (ids.length === 0) {
      state.backlogTasks = [];
      Swal.fire('Notice', 'No backlog items found.', 'info');
      applyFilters();
      return;
    }

    const fetchedItems = await getWorkItems(org, pat, ids, signal);

    state.backlogTasks = fetchedItems.map(item => {
      const fields = item.fields || {};
      const changedDateStr = fields['System.ChangedDate']
        ? getLocalDateString(new Date(fields['System.ChangedDate'])) : '';
      const areaPath = fields['System.AreaPath'] || selectedProject;
      const team = areaPath.includes('\\') ? areaPath.split('\\').pop() : selectedProject;
      const directTaskUrl = `https://dev.azure.com/${org}/${encodeURIComponent(selectedProject)}/_workitems/edit/${item.id}`;

      return {
        id: item.id,
        project: selectedProject,
        team,
        type: fields['System.WorkItemType'] || 'Task',
        title: fields['System.Title'] || 'Untitled',
        state: fields['System.State'] || 'Unknown',
        changedDate: changedDateStr,
        attributionDate: changedDateStr,
        todayLoggedHours: 0,
        totalCompleted: parseFloat(fields['Microsoft.VSTS.Scheduling.CompletedWork'] || 0),
        remainingHrs: parseFloat(fields['Microsoft.VSTS.Scheduling.RemainingWork'] || 0),
        taskUrl: directTaskUrl,
      };
    });

    markPinned();
    populateTypeFilter();
    populateStatusFilter();
    Swal.close();
    applyFilters();
  } catch (err) {
    if (err.name === 'AbortError') return;
    Swal.fire({ icon: 'error', title: 'Backlog Fetch Failed', text: err.message, confirmButtonColor: '#0284c7' });
  }
}

/* ============================================================
   FILTER DROPDOWNS
   ============================================================ */
function populateProjectFilter() {
  const dd = qs('#projectFilter');
  if (!dd) return;
  dd.innerHTML = '<option value="ALL">All Projects</option>';
  Object.keys(state.projectTeamsMap).sort().forEach(p => {
    const opt = document.createElement('option');
    opt.value = p; opt.innerText = p;
    dd.appendChild(opt);
  });
  populateTeamFilter('ALL');
}

function populateTeamFilter(selectedProject) {
  const dd = qs('#teamFilter');
  if (!dd) return;
  dd.innerHTML = '<option value="ALL">All Teams</option>';
  const teams = new Set();
  if (selectedProject === 'ALL') {
    Object.values(state.projectTeamsMap).forEach(s => s.forEach(t => teams.add(t)));
  } else if (state.projectTeamsMap[selectedProject]) {
    state.projectTeamsMap[selectedProject].forEach(t => teams.add(t));
  }
  Array.from(teams).sort().forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.innerText = t;
    dd.appendChild(opt);
  });
}

function populateTypeFilter() {
  const container = qs('#dynamicTypeOptions');
  if (!container) return;
  container.innerHTML = '';
  const source = state.currentTab === 'BACKLOG' ? state.backlogTasks : state.allFetchedTasks;
  const types = new Set();
  source.forEach(t => t.type && types.add(t.type));
  Array.from(types).sort().forEach(type => {
    const opt = document.createElement('option');
    opt.value = type; opt.innerText = type;
    container.appendChild(opt);
  });
}

function populateStatusFilter() {
  const container = qs('#dynamicStateOptions');
  if (!container) return;
  container.innerHTML = '';
  const source = state.currentTab === 'BACKLOG' ? state.backlogTasks : state.allFetchedTasks;
  const states = new Set();
  source.forEach(t => t.state && states.add(t.state));
  Array.from(states).sort().forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.innerText = s;
    container.appendChild(opt);
  });
}

function handleProjectChange() {
  const selectedProject = qs('#projectFilter').value;
  populateTeamFilter(selectedProject);
  if (state.currentTab === 'BACKLOG') fetchTeamBacklog();
  else applyFilters();
}

/* ============================================================
   STATS — with task count subtitles
   ============================================================ */
function calculateOverallStats() {
  // IMPORTANT: Cards ignore the date-range filter — they always show their own period
  // (Today / This Week / This Month).
  // The date-range filter only affects the TASK TABLE.

  let todayActive = 0, todayLoggedHours = 0, todayCompleted = 0;
  let weekItems = 0, weekLoggedHours = 0, weekRemainingHours = 0;
  let monthItems = 0, monthLoggedHours = 0, monthActive = 0, monthClosed = 0, monthPendingHours = 0;
  let totalActiveTasks = 0, totalClosedTasks = 0, totalHoursOverall = 0;

  // Round helper to avoid float drift
  const r = (n) => Math.round((Number(n) || 0) * 100) / 100;

  state.allFetchedTasks.forEach(task => {
    const closed = isClosedState(task.state);
    if (closed) totalClosedTasks++; else totalActiveTasks++;
    totalHoursOverall += r(task.totalCompleted);

    if (task.isToday) {
      todayLoggedHours += r(task.todayLoggedHours);
      if (closed) todayCompleted++; else todayActive++;
    }
    if (task.isThisWeek) {
      weekItems++;
      weekLoggedHours += r(task.totalCompleted);
      if (!closed) weekRemainingHours += r(task.remainingHrs);
    }
    if (task.isThisMonth) {
      monthItems++;
      monthLoggedHours += r(task.totalCompleted);
      if (closed) monthClosed++;
      else { monthActive++; monthPendingHours += r(task.remainingHrs); }
    }
  });

  const target = CONFIG.WEEKLY_CAPACITY_HOURS;
  const capacityPct = Math.min(Math.round((weekLoggedHours / target) * 100), 100);
  const totalProjectsCount = Object.keys(state.projectTeamsMap).length;
  let totalTeamsCount = 0;
  Object.values(state.projectTeamsMap).forEach(s => totalTeamsCount += s.size);
  const avgDailyHours = todayLoggedHours > 0 ? todayLoggedHours : weekLoggedHours / 5;

  const setTxt = (id, val) => { const el = qs('#' + id); if (el) el.innerText = val; };
  const setSub = (id, val) => {
    const el = qs('#' + id);
    if (!el) return;
    const sub = el.parentElement?.querySelector('.sub-value');
    if (sub) sub.textContent = val;
  };

  setTxt('cardTodayActive', todayActive);
  setTxt('cardTodayHours', `${todayLoggedHours.toFixed(1)} hrs`);
  setTxt('cardTodayCompleted', todayCompleted);
  setTxt('cardTodayTarget', `${CONFIG.DAILY_TARGET_HOURS.toFixed(1)} hrs`);

  setTxt('cardWeekItems', weekItems);
  setTxt('cardWeekHours', `${weekLoggedHours.toFixed(1)} hrs`);
  setSub('cardWeekHours', `${weekItems} item${weekItems === 1 ? '' : 's'} this week`);
  setTxt('cardWeekCapacity', `${capacityPct}%`);
  setTxt('cardWeekCapacitySub', `${weekLoggedHours.toFixed(1)} / ${target} hrs`);
  setTxt('cardWeekRemaining', `${weekRemainingHours.toFixed(1)} hrs`);

  setTxt('cardMonthItems', monthItems);
  setTxt('cardMonthLogged', `${monthLoggedHours.toFixed(1)} hrs`);
  setSub('cardMonthLogged', `${monthItems} item${monthItems === 1 ? '' : 's'} this month`);
  setTxt('cardMonthActive', monthActive);
  setTxt('cardMonthClosed', monthClosed);
  setTxt('cardMonthPendingHours', `${monthPendingHours.toFixed(1)} hrs`);
  setTxt('cardAvgDailyHours', `${avgDailyHours.toFixed(1)} hrs`);
  setTxt('cardTotalProjects', totalProjectsCount);
  setTxt('cardTotalTeams', totalTeamsCount);

  setTxt('profileTotalTasks', state.allFetchedTasks.length);
  setTxt('profileActiveTasks', totalActiveTasks);
  setTxt('profileClosedTasks', totalClosedTasks);
  setTxt('profileTotalHours', `${totalHoursOverall.toFixed(1)} hrs`);

  return { todayHours: todayLoggedHours, todayActive, todayCompleted };
}

/* ============================================================
   TABS
   ============================================================ */
function switchTab(tab) {
  state.currentTab = tab;
  qsa('.tab-btn').forEach(b => b.classList.remove('active'));
  const map = { TODAY: 'tabToday', WEEK: 'tabWeek', MONTH: 'tabMonth', BACKLOG: 'tabBacklog', ALL: 'tabAll' };
  const el = qs('#' + map[tab]);
  if (el) el.classList.add('active');

  populateTypeFilter();
  populateStatusFilter();

  if (tab === 'BACKLOG' && state.backlogTasks.length === 0) fetchTeamBacklog();
  else applyFilters();
}

/* ============================================================
   PAGINATION + FILTERS — with count badge
   ============================================================ */
function handleRowsPerPageChange() {
  const el = qs('#rowsPerPage');
  if (el) state.rowsPerPage = parseInt(el.value, 10);
  state.currentPage = 1;
  renderPaginatedTable();
}

function applyFilters() {
  const search = qs('#searchInput') ? qs('#searchInput').value.toLowerCase() : '';
  const projectFilter = qs('#projectFilter') ? qs('#projectFilter').value : 'ALL';
  const teamFilter = qs('#teamFilter') ? qs('#teamFilter').value : 'ALL';
  const typeFilter = qs('#typeFilter') ? qs('#typeFilter').value : 'ALL';
  const stateFilter = qs('#stateFilter') ? qs('#stateFilter').value : 'ALL';

  const source = state.currentTab === 'BACKLOG' ? state.backlogTasks : state.allFetchedTasks;
  const range = computeRange();

  state.currentFilteredTasks = source.filter(task => {
    if (state.currentTab !== 'ALL') {
      const taskDate = task.attributionDate || task.changedDate;
      if (!isInRange(taskDate, range)) return false;
    }
    if (state.currentTab === 'TODAY' && !task.isToday) return false;
    if (state.currentTab === 'WEEK' && !task.isThisWeek) return false;
    if (state.currentTab === 'MONTH' && !task.isThisMonth) return false;
    if (projectFilter !== 'ALL' && task.project !== projectFilter) return false;
    if (teamFilter !== 'ALL' && task.team !== teamFilter) return false;
    if (typeFilter !== 'ALL' && task.type !== typeFilter) return false;

    const matchesSearch =
      task.title.toLowerCase().includes(search) || task.id.toString().includes(search);

    const closed = isClosedState(task.state);
    const isNew = isNewState(task.state);
    let matchesState = true;
    if (stateFilter === 'NEW') matchesState = isNew;
    else if (stateFilter === 'ACTIVE') matchesState = !closed && !isNew;
    else if (stateFilter === 'CLOSED') matchesState = closed;
    else if (stateFilter !== 'ALL') matchesState = task.state === stateFilter;

    return matchesSearch && matchesState;
  });

  state.currentFilteredTasks.sort((a, b) => {
    if (a._pinned && !b._pinned) return -1;
    if (!a._pinned && b._pinned) return 1;
    return 0;
  });

  // Date range count badge
  const countEl = qs('#dateRangeCount');
  if (countEl) {
    const total = source.length;
    const shown = state.currentFilteredTasks.length;
    countEl.textContent = `(${shown} of ${total} items)`;
  }

  state.currentPage = 1;
  renderPaginatedTable();
}

function renderPaginatedTable() {
  const totalItems = state.currentFilteredTasks.length;
  const totalPages = Math.ceil(totalItems / state.rowsPerPage) || 1;
  if (state.currentPage > totalPages) state.currentPage = totalPages;
  if (state.currentPage < 1) state.currentPage = 1;

  const start = (state.currentPage - 1) * state.rowsPerPage;
  const end = Math.min(start + state.rowsPerPage, totalItems);
  renderTable(state.currentFilteredTasks.slice(start, end));

  const pageInfo = qs('#pageInfo');
  const pageIndicator = qs('#pageIndicator');
  const prevBtn = qs('#prevPageBtn');
  const nextBtn = qs('#nextPageBtn');

  if (pageInfo) {
    pageInfo.innerText = totalItems === 0
      ? 'Showing 0-0 of 0 items'
      : `Showing ${start + 1}-${end} of ${totalItems} items`;
  }
  if (pageIndicator) pageIndicator.innerText = `Page ${state.currentPage} of ${totalPages}`;
  if (prevBtn) prevBtn.disabled = state.currentPage === 1;
  if (nextBtn) nextBtn.disabled = state.currentPage === totalPages || totalPages === 0;
}

function changePage(delta) {
  state.currentPage += delta;
  renderPaginatedTable();
}

function renderTable(tasks) {
  const tbody = qs('#taskTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (tasks.length === 0) {
    renderEmptyState(tbody, 'No work items matching this view.', 'Try adjusting filters or switching tabs.');
    return;
  }
  const frag = document.createDocumentFragment();
  tasks.forEach(task => frag.appendChild(buildTaskRow(task)));
  tbody.appendChild(frag);
}

/* ============================================================
   PRODUCTIVITY
   ============================================================ */
function updateProductivityPanel() {
  const score = computeProductivityScore(state.allFetchedTasks);
  const streak = computeStreak(state.allFetchedTasks, getLocalDateString());
  const setTxt = (id, val) => { const el = qs('#' + id); if (el) el.innerText = val; };
  setTxt('profileScore', score);
  setTxt('profileStreak', `${streak.current} days`);
  setTxt('profileBestStreak', `${streak.best} days`);
}

/* ============================================================
   SPRINT — skip area-path teams
   ============================================================ */
async function loadSprintSummary() {
  const org = localStorage.getItem(CONFIG.LS.ORG);
  const pat = localStorage.getItem(CONFIG.LS.PAT);
  if (!org || !pat) return;

  const projects = Object.keys(state.projectTeamsMap || {});
  if (!projects.length) return;
  const project = projects[0];
  const teams = Array.from(state.projectTeamsMap[project] || []);
  if (!teams.length) return;

  // Prefer real team names (no spaces or backslashes) over area-path teams
  const team = teams.find(t => !t.includes(' ') && !t.includes('\\'));
  if (!team) return;  // No valid team configured — skip sprint panel

  const panel = qs('#sprintSummary');
  if (!panel) return;

  try {
    const signal = state.abortController ? state.abortController.signal : undefined;
    const it = await getCurrentIteration(org, pat, project, team, signal);
    if (!it) return;
    const counts = await getSprintCounts(org, pat, project, it.path, signal);
    const remaining = daysRemaining(it.finishDate);

    const sprintIds = new Set(counts.ids.map(String));
    const mySprintItems = state.allFetchedTasks.filter(t => sprintIds.has(String(t.id)));
    const closedCount = mySprintItems.filter(t => isClosedState(t.state)).length;
    const myTotal = mySprintItems.length;
    const pct = myTotal ? Math.round((closedCount / myTotal) * 100) : 0;

    qs('#sprintName').innerText = it.name || '—';
    qs('#sprintDates').innerText = `${formatShortDate(it.startDate)} → ${formatShortDate(it.finishDate)}`;
    qs('#sprintDays').innerText = remaining != null ? remaining : '—';
    qs('#sprintProgressFill').style.width = `${pct}%`;
    qs('#sprintProgressText').innerText = `${closedCount} / ${myTotal} my items closed`;
    qs('#sprintProgressPct').innerText = `${pct}%`;
    panel.style.display = 'block';
  } catch (_) { /* silent */ }
}

function formatShortDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ============================================================
   DETAILS DRAWER
   ============================================================ */
let drawerAbort = null;

async function openDetails(workItemId) {
  const org = localStorage.getItem(CONFIG.LS.ORG);
  const pat = localStorage.getItem(CONFIG.LS.PAT);
  if (!org || !pat) return;

  if (drawerAbort) drawerAbort.abort();
  drawerAbort = new AbortController();

  const drawer = qs('#detailsDrawer');
  if (drawer) {
    drawer.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-eyebrow">Loading…</div>
        <button type="button" class="drawer-close" onclick="closeDetailsDrawer()" aria-label="Close">×</button>
      </div>
      <div class="drawer-body">
        <div class="skeleton skeleton-text" style="width:70%;height:20px;margin-bottom:14px;"></div>
        <div class="skeleton skeleton-text" style="width:100%;margin-bottom:8px;"></div>
        <div class="skeleton skeleton-text" style="width:90%;margin-bottom:8px;"></div>
      </div>
    `;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }

  try {
    const item = await fetchWorkItemDetails(org, pat, workItemId, drawerAbort.signal);
    renderDetailsDrawer(item, org);
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (drawer) {
      drawer.innerHTML = `
        <div class="drawer-header">
          <div class="drawer-eyebrow">Error</div>
          <button type="button" class="drawer-close" onclick="closeDetailsDrawer()" aria-label="Close">×</button>
        </div>
        <div class="drawer-body">
          <p style="color:#f43f5e;">Failed to load #${escapeHtml(workItemId)}.</p>
        </div>
      `;
    }
  }
}

function copyToClipboard(text) {
  const str = String(text);

  // Try modern clipboard API (works on HTTPS or localhost)
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(str)
      .then(() => showCopied(str))
      .catch(() => legacyCopy(str));
    return;
  }

  // Fallback for HTTP LAN access
  legacyCopy(str);
}

function legacyCopy(str) {
  try {
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);

    // Select + copy
    ta.select();
    ta.setSelectionRange(0, str.length);
    const ok = document.execCommand('copy');

    document.body.removeChild(ta);

    if (ok) {
      showCopied(str);
    } else {
      showCopyPrompt(str);
    }
  } catch (_) {
    showCopyPrompt(str);
  }
}

function showCopied(str) {
  Swal.fire({
    icon: 'success',
    title: 'Copied!',
    html: `Copied <strong>#${escapeHtml(str)}</strong> to clipboard.`,
    timer: 1200,
    showConfirmButton: false,
  });
}

function showCopyPrompt(str) {
  Swal.fire({
    icon: 'info',
    title: 'Copy manually',
    html: `
      <p style="margin-bottom:10px;">Auto-copy is not available on this browser.</p>
      <input type="text" value="${escapeHtml(str)}" readonly
        style="width:100%;padding:10px;border-radius:6px;border:1px solid #334155;background:#334155;color:#f8fafc;font-size:16px;text-align:center;"
        onclick="this.select()"
        id="copyFallbackInput">
    `,
    confirmButtonText: 'Done',
    confirmButtonColor: '#0284c7',
    didOpen: () => {
      const inp = document.getElementById('copyFallbackInput');
      if (inp) { inp.focus(); inp.select(); }
    },
  });
}

/* ============================================================
   EXPORT
   ============================================================ */
function exportCurrentViewCsv() {
  exportTasksToCsv(state.currentFilteredTasks, `tasks_${state.currentTab.toLowerCase()}`);
}

function exportCurrentViewJson() {
  exportTasksToJson(state.currentFilteredTasks, `tasks_${state.currentTab.toLowerCase()}`);
}

/* ============================================================
   TIMELOG
   ============================================================ */
function removeTimeEntry(entryId) {
  deleteEntry(entryId);
  Swal.fire({ icon: 'success', title: 'Deleted', timer: 900, showConfirmButton: false });
}

function refreshTimelogBadges() {
  renderPaginatedTable();
}

/* ============================================================
   UPDATE TASK MODAL
   ============================================================ */
let updateTaskId = null;

function openUpdateTaskModal(taskId) {
  const task = state.currentFilteredTasks.find(t => String(t.id) === String(taskId))
            || state.allFetchedTasks.find(t => String(t.id) === String(taskId));
  if (!task) return;

  updateTaskId = task.id;
  const stateEl = qs('#updateState');
  const completedEl = qs('#updateCompleted');
  const remainingEl = qs('#updateRemaining');
  const commentEl = qs('#updateComment');

  if (stateEl) stateEl.value = '';
  if (completedEl) completedEl.value = task.totalCompleted || '';
  if (remainingEl) remainingEl.value = task.remainingHrs || '';
  if (commentEl) commentEl.value = '';

  const modal = qs('#updateTaskModal');
  if (modal) { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); }
}

function closeUpdateTaskModal() {
  const modal = qs('#updateTaskModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  updateTaskId = null;
}

async function submitUpdateTask() {
  if (!updateTaskId) return;
  const org = localStorage.getItem(CONFIG.LS.ORG);
  const pat = localStorage.getItem(CONFIG.LS.PAT);

  const newState = qs('#updateState').value;
  const completedInput = qs('#updateCompleted').value;
  const remainingInput = qs('#updateRemaining') ? qs('#updateRemaining').value : '';
  const comment = qs('#updateComment').value.trim();

  if (!newState && completedInput === '' && remainingInput === '' && !comment) {
    Swal.fire({ icon: 'info', title: 'Nothing to update', timer: 1200, showConfirmButton: false });
    return;
  }

  const willClose = newState === 'Closed' || newState === 'Resolved';
  const fields = {};
  if (newState) fields['System.State'] = newState;
  if (completedInput !== '') fields['Microsoft.VSTS.Scheduling.CompletedWork'] = parseFloat(completedInput);
  if (remainingInput !== '' && !willClose) {
    const remVal = parseFloat(remainingInput);
    if (remVal >= 0) fields['Microsoft.VSTS.Scheduling.RemainingWork'] = remVal;
  }

  Swal.fire({ title: 'Updating...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    if (Object.keys(fields).length > 0) await updateWorkItem(org, pat, updateTaskId, fields);
    if (comment) await addComment(org, pat, updateTaskId, comment);
    closeUpdateTaskModal();
    Swal.fire({ icon: 'success', title: 'Updated', timer: 1500, showConfirmButton: false });
    clearRevisionCache();
    refreshDashboard();
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Update Failed', text: err.message, confirmButtonColor: '#0284c7' });
  }
}

function promptUpdateTask() {
  const id = window.prompt('Work item ID to update:');
  if (id && !isNaN(id)) openUpdateTaskModal(Number(id));
}

/* ============================================================
   REFRESH
   ============================================================ */
function refreshDashboard() {
  const org = localStorage.getItem(CONFIG.LS.ORG) || qs('#orgName').value.trim();
  const email = localStorage.getItem(CONFIG.LS.EMAIL) || qs('#userEmail').value.trim();
  const pat = localStorage.getItem(CONFIG.LS.PAT) || qs('#patToken').value.trim();
  if (!org || !email || !pat) {
    Swal.fire({ icon: 'info', title: 'No credentials', confirmButtonColor: '#0284c7' });
    return;
  }
  clearRevisionCache();
  state.backlogTasks = [];
  fetchUserTasks(org, email, pat);
}

/* ============================================================
   EXPOSE TO WINDOW
   ============================================================ */
Object.assign(window, {
  toggleTheme, handleLogin, logout, switchTab, applyFilters,
  handleProjectChange, handleRowsPerPageChange, changePage,
  fetchTeamBacklog, refreshDashboard, toggleTaskPin,
  pomodoroStart, pomodoroPause, pomodoroReset,
  openSettings, closeSettings, saveSettingsFromForm, resetSettingsFromForm,
  openDetails, closeDetailsDrawer, copyToClipboard, loadSprintSummary,
  exportCurrentViewCsv, exportCurrentViewJson,
  openTimeLogModal, removeTimeEntry, refreshTimelogBadges,
  getEntriesForTask, getAllEntries, getTotalToday,
  installPwa,
  openUpdateTaskModal, closeUpdateTaskModal, submitUpdateTask, promptUpdateTask,
  toggleDrawerEditMode, saveDrawerEdit, clearDrawerLogDate,
});

// Debug: expose state for console inspection
window.state = state;