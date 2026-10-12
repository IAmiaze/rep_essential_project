import { qs } from './utils.js';

const TAB_KEYS = {
  '1': 'TODAY',
  '2': 'WEEK',
  '3': 'MONTH',
  '4': 'BACKLOG',
  '5': 'ALL',
};

const MODAL_IDS = ['settingsModal', 'updateTaskModal', 'detailsDrawer'];

export function initKeyboardShortcuts({ switchTab, refresh, applyFilters }) {
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    const inField = tag === 'input' || tag === 'select' || tag === 'textarea' || e.target.isContentEditable;

    // Escape: close modals/drawer, else clear search
    if (e.key === 'Escape') {
      for (const id of MODAL_IDS) {
        const el = document.getElementById(id);
        if (el && el.classList.contains('open')) {
          el.classList.remove('open');
          el.setAttribute('aria-hidden', 'true');
          return;
        }
      }
      const search = qs('#searchInput');
      if (search) search.value = '';
      const dash = qs('#dashboardSection');
      if (dash && dash.style.display !== 'none') {
        applyFilters();
        if (search) search.blur();
      }
      return;
    }

    if (inField) return;

    // Number keys → tabs
    if (TAB_KEYS[e.key]) {
      const dash = qs('#dashboardSection');
      if (dash && dash.style.display !== 'none') {
        e.preventDefault();
        switchTab(TAB_KEYS[e.key]);
      }
      return;
    }

    // "/" → focus search
    if (e.key === '/') {
      const search = qs('#searchInput');
      if (search) {
        e.preventDefault();
        search.focus();
        search.select();
      }
      return;
    }

    // "u" → prompt for work item ID and open Update modal
    if (e.key === 'u' || e.key === 'U') {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const dash = qs('#dashboardSection');
      if (dash && dash.style.display !== 'none') {
        e.preventDefault();
        if (typeof window.promptUpdateTask === 'function') window.promptUpdateTask();
      }
      return;
    }

    // "r" → refresh
    if (e.key === 'r' || e.key === 'R') {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const dash = qs('#dashboardSection');
      if (dash && dash.style.display !== 'none') {
        e.preventDefault();
        refresh();
      }
    }
  });
}