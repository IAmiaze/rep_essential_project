import { CONFIG } from './js/config.js';
import {
  qs, qsa, escapeHtml, wiqlEscape,
  getLocalDateString, isDateInCurrentWeek,
  isClosedState, isNewState,
  mapWithConcurrency,
} from './js/utils.js';
import {
  runWiql, getWorkItems, getRevisions, computeHoursAddedToday,
} from './js/api.js';
import { state, setAbortController } from './js/state.js';
import { initKeyboardShortcuts } from './js/keyboard.js';
import { showCardSkeletons, showTableSkeleton, renderEmptyState, buildTaskRow } from './js/render.js';
import { renderAnalytics } from './js/charts.js';
import {
  getPinned, togglePin, isPinned,
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
  toggleDrawerEditMode, saveDrawerEdit,
} from './js/details.js';
import { exportTasksToCsv, exportTasksToJson } from './js/export.js';
import {
  openTimeLogModal, getEntriesForTask, getEntriesForToday,
  deleteEntry, getAllEntries, getTotalToday,
  markEntrySynced,
} from './js/timetracking.js';
import {
  updateWorkItem,
  changeWorkItemState, logCompletedWork, addComment,
} from './js/workitems.js';

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
  initKeyboardShortcuts({
    switchTab,
    refresh: refreshDashboard,
    applyFilters,
  });
  initPomodoro();

  // Event delegation for pin buttons
  document.addEventListener('click', (e) => {
    const pinBtn = e.target.closest('.pin-btn');
    if (!pinBtn) return;
    e.stopPropagation();
    e.preventDefault();
    const id = pinBtn.getAttribute('data-pin-id');
    if (id) toggleTaskPin(Number(id));
  });
  
  // Ctrl+Enter saves when drawer edit form is open
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const editForm = document.getElementById('drawerEditForm');
      if (editForm && editForm.style.display !== 'none') {
        e.preventDefault();
        if (typeof window.saveDrawerEdit === 'function') window.saveDrawerEdit();
      }
    }
  });

  // Event delegation for time-log buttons
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

  // Click overlay to close any modal
  document.addEventListener('click', (e) => {
    if (!e.target.classList.contains('modal-overlay')) return;
    const id = e.target.id;
    if (id === 'settingsModal') closeSettings();
    if (id === 'updateTaskModal') closeUpdateTaskModal();
  });

  const savedOrg = localStorage.getItem(CONFIG.LS.ORG);
  const savedEmail = localStorage.getItem(CONFIG.LS.EMAIL);
  const savedPat = localStorage.getItem(CONFIG.LS.PAT);

  if (savedOrg && savedEmail && savedPat) {
    qs('#orgName').value = savedOrg;
    qs('#userEmail').value = savedEmail;
    qs('#patToken').value = savedPat;
    fetchUserTasks(savedOrg, savedEmail, savedPat);
  }

  // Register service worker (PWA)
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
  }).catch(err => {
    console.warn('[PWA] Service Worker registration failed:', err);
  });
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
    Swal.fire({
      icon: 'success',
      title: 'App Installed',
      text: 'You can now launch the dashboard from your home screen or desktop.',
      timer: 2500,
      showConfirmButton: false,
    });
  });
}

async function installPwa() {
  if (!deferredInstallPrompt) {
    Swal.fire({
      icon: 'info',
      title: 'Install not available',
      html: 'Your browser may already have it installed, or it doesn\'t support PWA install.<br><br><small style="color:#94a3b8;">Look for the install icon in the address bar.</small>',
      confirmButtonColor: '#0284c7',
    });
    return;
  }
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  if (choice.outcome === 'accepted') {
    Swal.fire({ icon: 'success', title: 'Installing…', timer: 1200, showConfirmButton: false });
  }
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
    Swal.fire({
      icon: 'warning',
      title: 'Missing Fields',
      text: 'Please enter Organization Name, Email, and PAT token.',
      confirmButtonColor: '#0284c7',
    });
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
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#475569',
    confirmButtonText: 'Yes, Logout',
  }).then(result => {
    if (!result.isConfirmed) return;
    localStorage.removeItem(CONFIG.LS.ORG);
    localStorage.removeItem(CONFIG.LS.EMAIL);
    localStorage.removeItem(CONFIG.LS.PAT);

    qs('#dashboardSection').style.display = 'none';
    qs('#loginSection').style.display = 'block';

    state.allFetchedTasks = [];
    state.backlogTasks = [];
    state.currentFilteredTasks = [];

    Swal.fire({ icon: 'success', title: 'Logged Out', timer: 1200, showConfirmButton: false });
  });
}

/* ============================================================
   MAIN FETCH
   ============================================================ */
async function fetchUserTasks(org, email, pat) {
  Swal.fire({
    title: 'Connecting to Azure DevOps',
    text: 'Fetching work items and calculating capacity...',
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

    const tasks = await mapWithConcurrency(fetchedItems, CONFIG.REVISION_CONCURRENCY, async item => {
      const fields = item.fields || {};
      const changedDateObj = fields['System.ChangedDate']
        ? new Date(fields['System.ChangedDate'])
        : new Date();
      const changedDateStr = fields['System.ChangedDate'] ? getLocalDateString(changedDateObj) : '';

      const project = fields['System.TeamProject'] || 'N/A';
      const areaPath = fields['System.AreaPath'] || project;
      const team = areaPath.includes('\\') ? areaPath.split('\\').pop() : project;

      if (!state.projectTeamsMap[project]) state.projectTeamsMap[project] = new Set();
      state.projectTeamsMap[project].add(team);

      const totalCompleted = parseFloat(fields['Microsoft.VSTS.Scheduling.CompletedWork'] || 0);
      const remainingHrs = parseFloat(fields['Microsoft.VSTS.Scheduling.RemainingWork'] || 0);

      let todayLoggedHours = 0;
      if (changedDateStr === todayStr) {
        try {
          const revs = await getRevisions(org, pat, item.id, signal);
          todayLoggedHours = computeHoursAddedToday(revs, todayStr);
        } catch (_) { todayLoggedHours = 0; }
      }

      const directTaskUrl = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_workitems/edit/${item.id}`;

      return {
        id: item.id,
        project, team,
        type: fields['System.WorkItemType'] || 'Task',
        title: fields['System.Title'] || 'Untitled',
        state: fields['System.State'] || 'Unknown',
        changedDate: changedDateStr,
        todayLoggedHours,
        totalCompleted,
        remainingHrs,
        isToday: changedDateStr === todayStr,
        isThisWeek: isDateInCurrentWeek(changedDateObj),
        isThisMonth: changedDateStr.startsWith(currentYearMonth),
        taskUrl: directTaskUrl,
      };
    });

    state.allFetchedTasks = tasks.filter(t => !t.__error);
    markPinned();

    populateProjectFilter();
    populateTypeFilter();
    populateStatusFilter();
    const todayStats = calculateOverallStats();
    renderAnalytics(state.allFetchedTasks);
    updateProductivityPanel();
    applyFilters();

    runDailyChecks(todayStats);

    const widget = qs('#pomodoroWidget');
    if (widget) widget.style.display = 'block';
    pomodoroRequestPermission();

    loadSprintSummary();

    Swal.fire({
      icon: 'success',
      title: 'Dashboard Loaded',
      text: `Successfully synced ${state.allFetchedTasks.length} work items.`,
      timer: 1500,
      showConfirmButton: false,
    });
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
      icon: 'info',
      title: 'Select Specific Project',
      text: 'Please select a specific Project from the dropdown to load its Team Backlog.',
      confirmButtonColor: '#0284c7',
    });
    return;
  }

  Swal.fire({
    title: 'Loading Backlog',
    text: `Fetching backlog for ${selectedProject}...`,
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  const signal = setAbortController().signal;

  try {
    const wiqlQuery = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${wiqlEscape(selectedProject)}' AND [System.State] NOT IN ('Closed', 'Completed', 'Done', 'Removed') ORDER BY [System.ChangedDate] DESC`;
    const ids = await runWiql(org, pat, wiqlQuery, signal);

    if (ids.length === 0) {
      state.backlogTasks = [];
      Swal.fire('Notice', 'No backlog items found for this project.', 'info');
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
    Swal.fire({
      icon: 'error',
      title: 'Backlog Fetch Failed',
      text: err.message,
      confirmButtonColor: '#0284c7',
    });
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
   STATS
   ============================================================ */
function calculateOverallStats() {
  let todayActive = 0, todayHours = 0, todayCompleted = 0;
  let weekItems = 0, weekLoggedHours = 0, weekRemainingHours = 0;
  let monthItems = 0, monthLoggedHours = 0, monthActive = 0, monthClosed = 0, monthPendingHours = 0;
  let totalActiveTasks = 0, totalClosedTasks = 0, totalHoursOverall = 0;

  state.allFetchedTasks.forEach(task => {
    const closed = isClosedState(task.state);
    if (closed) totalClosedTasks++; else totalActiveTasks++;
    totalHoursOverall += task.totalCompleted;

    if (task.isToday) {
      todayHours += task.todayLoggedHours;
      if (closed) todayCompleted++; else todayActive++;
    }
    if (task.isThisWeek) {
      weekItems++;
      weekLoggedHours += task.totalCompleted;
      if (!closed) weekRemainingHours += task.remainingHrs;
    }
    if (task.isThisMonth) {
      monthItems++;
      monthLoggedHours += task.totalCompleted;
      if (closed) monthClosed++;
      else { monthActive++; monthPendingHours += task.remainingHrs; }
    }
  });

  const target = CONFIG.WEEKLY_CAPACITY_HOURS;
  const capacityPct = Math.min(Math.round((weekLoggedHours / target) * 100), 100);
  const totalProjectsCount = Object.keys(state.projectTeamsMap).length;
  let totalTeamsCount = 0;
  Object.values(state.projectTeamsMap).forEach(s => totalTeamsCount += s.size);
  const avgDailyHours = todayHours > 0 ? todayHours : weekLoggedHours / 5;

  const setTxt = (id, val) => { const el = qs('#' + id); if (el) el.innerText = val; };

  setTxt('cardTodayActive', todayActive);
  setTxt('cardTodayHours', `${todayHours.toFixed(1)} hrs`);
  setTxt('cardTodayCompleted', todayCompleted);
  setTxt('cardTodayTarget', `${CONFIG.DAILY_TARGET_HOURS.toFixed(1)} hrs`);

  setTxt('cardWeekItems', weekItems);
  setTxt('cardWeekHours', `${weekLoggedHours.toFixed(1)} hrs`);
  setTxt('cardWeekCapacity', `${capacityPct}%`);
  setTxt('cardWeekCapacitySub', `${weekLoggedHours.toFixed(1)} / ${target} hrs`);
  setTxt('cardWeekRemaining', `${weekRemainingHours.toFixed(1)} hrs`);

  setTxt('cardMonthItems', monthItems);
  setTxt('cardMonthLogged', `${monthLoggedHours.toFixed(1)} hrs`);
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

  return { todayHours, todayActive, todayCompleted };
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
   PAGINATION + FILTERS
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

  state.currentFilteredTasks = source.filter(task => {
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
  const pageTasks = state.currentFilteredTasks.slice(start, end);

  renderTable(pageTasks);

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
   PRODUCTIVITY PANEL
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
   SPRINT SUMMARY
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
  const team = teams[0];

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
    qs('#sprintDates').innerText =
      `${formatShortDate(it.startDate)} → ${formatShortDate(it.finishDate)}`;
    qs('#sprintDays').innerText = remaining != null ? remaining : '—';
    qs('#sprintProgressFill').style.width = `${pct}%`;
    qs('#sprintProgressText').innerText = `${closedCount} / ${myTotal} my items closed`;
    qs('#sprintProgressPct').innerText = `${pct}%`;

    panel.style.display = 'block';
  } catch (_) {
    // Silent
  }
}

function formatShortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
        <div class="skeleton skeleton-text" style="width:80%;"></div>
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
          <p style="color:#f43f5e;">Failed to load work item #${escapeHtml(workItemId)}.</p>
          <p style="color:var(--text-muted);font-size:12px;margin-top:8px;">${escapeHtml(e.message)}</p>
        </div>
      `;
    }
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(String(text)).then(() => {
    Swal.fire({
      icon: 'success',
      title: 'Copied',
      text: `#${text} copied to clipboard`,
      timer: 900,
      showConfirmButton: false,
    });
  });
}

/* ============================================================
   EXPORT
   ============================================================ */
function exportCurrentViewCsv() {
  const label = `tasks_${state.currentTab.toLowerCase()}`;
  exportTasksToCsv(state.currentFilteredTasks, label);
}

function exportCurrentViewJson() {
  const label = `tasks_${state.currentTab.toLowerCase()}`;
  exportTasksToJson(state.currentFilteredTasks, label);
}

/* ============================================================
   TIMELOG UTILITIES
   ============================================================ */
function removeTimeEntry(entryId) {
  deleteEntry(entryId);
  Swal.fire({ icon: 'success', title: 'Deleted', timer: 900, showConfirmButton: false });
}

function refreshTimelogBadges() {
  renderPaginatedTable();
}

/* ============================================================
   UPDATE TASK
   ============================================================ */
let updateTaskId = null;

function openUpdateTaskModal(taskId) {
  const task = state.currentFilteredTasks.find(t => String(t.id) === String(taskId))
            || state.allFetchedTasks.find(t => String(t.id) === String(taskId));
  if (!task) return;

  updateTaskId = task.id;
  qs('#updateState').value = '';
  qs('#updateCompleted').value = '';
  qs('#updateComment').value = '';

  const modal = qs('#updateTaskModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
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
  const completed = qs('#updateCompleted').value;
  const comment = qs('#updateComment').value.trim();

  if (!newState && !completed && !comment) {
    Swal.fire({ icon: 'info', title: 'Nothing to update', timer: 1200, showConfirmButton: false });
    return;
  }

  Swal.fire({ title: 'Updating...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    if (newState) {
      await changeWorkItemState(org, pat, updateTaskId, newState);
    }
    if (completed) {
      await logCompletedWork(org, pat, updateTaskId, parseFloat(completed));
    }
    if (comment) {
      await addComment(org, pat, updateTaskId, comment);
    }

    closeUpdateTaskModal();

    Swal.fire({
      icon: 'success',
      title: 'Updated',
      text: `Work item #${updateTaskId} updated successfully.`,
      timer: 1500,
      showConfirmButton: false,
    });

    refreshDashboard();
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Update Failed',
      text: err.message,
      confirmButtonColor: '#0284c7',
    });
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
    Swal.fire({
      icon: 'info',
      title: 'No credentials',
      text: 'Please log in again.',
      confirmButtonColor: '#0284c7',
    });
    return;
  }
  state.backlogTasks = [];
  fetchUserTasks(org, email, pat);
}

/* ============================================================
   EXPOSE TO WINDOW
   ============================================================ */
Object.assign(window, {
  toggleTheme,
  handleLogin,
  logout,
  switchTab,
  applyFilters,
  handleProjectChange,
  handleRowsPerPageChange,
  changePage,
  fetchTeamBacklog,
  refreshDashboard,
  toggleTaskPin,
  pomodoroStart,
  pomodoroPause,
  pomodoroReset,
  openSettings,
  closeSettings,
  saveSettingsFromForm,
  resetSettingsFromForm,
  openDetails,
  closeDetailsDrawer,
  copyToClipboard,
  loadSprintSummary,
  exportCurrentViewCsv,
  exportCurrentViewJson,
  openTimeLogModal,
  removeTimeEntry,
  refreshTimelogBadges,
  getEntriesForTask,
  getAllEntries,
  getTotalToday,
  installPwa,
  openUpdateTaskModal,
  closeUpdateTaskModal,
  submitUpdateTask,
  promptUpdateTask,
  toggleDrawerEditMode,
  saveDrawerEdit,
});