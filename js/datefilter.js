import { getLocalDateString } from './utils.js';
import { getSettings, saveSettings } from './config.js';

const LS_KEY = 'date_range_state';

export function getDateState() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {
      mode: getSettings().dateRangeMode || 'current_month',
      from: '',
      to: '',
    };
  } catch {
    return { mode: 'current_month', from: '', to: '' };
  }
}

export function saveDateState(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

export function computeRange(state = getDateState()) {
  const today = new Date();
  const todayStr = getLocalDateString(today);

  switch (state.mode) {
    case 'today':
      return { from: todayStr, to: todayStr, label: 'Today' };

    case 'last_7': {
      const from = new Date(today);
      from.setDate(today.getDate() - 6);
      return { from: getLocalDateString(from), to: todayStr, label: 'Last 7 days' };
    }

    case 'last_30': {
      const from = new Date(today);
      from.setDate(today.getDate() - 29);
      return { from: getLocalDateString(from), to: todayStr, label: 'Last 30 days' };
    }

    case 'current_month': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return {
        from: getLocalDateString(first),
        to: getLocalDateString(last),
        label: today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      };
    }

    case 'last_month': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        from: getLocalDateString(first),
        to: getLocalDateString(last),
        label: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      };
    }

    case 'custom':
      return {
        from: state.from || todayStr,
        to: state.to || todayStr,
        label: `${state.from || '?'} → ${state.to || '?'}`,
      };

    case 'all':
      return { from: '1970-01-01', to: '2999-12-31', label: 'All time' };

    default:
      return { from: '1970-01-01', to: '2999-12-31', label: 'All time' };
  }
}

export function isInRange(dateStr, range = computeRange()) {
  if (!dateStr) return false;
  return dateStr >= range.from && dateStr <= range.to;
}

/* ---------- Init the filter UI ---------- */
export function initDateFilter(onChange) {
  const modeSel = document.getElementById('dateRangeMode');
  const fromInput = document.getElementById('dateFrom');
  const toInput = document.getElementById('dateTo');
  const label = document.getElementById('dateRangeLabel');

  if (!modeSel) return;

  // Restore saved state
  const state = getDateState();
  modeSel.value = state.mode;
  if (fromInput && state.from) fromInput.value = state.from;
  if (toInput && state.to) toInput.value = state.to;
  updateCustomVisibility();

  modeSel.onchange = () => {
    const newState = { ...getDateState(), mode: modeSel.value };
    saveDateState(newState);
    updateCustomVisibility();
    updateLabel();
    onChange();
  };

  if (fromInput) {
    fromInput.onchange = () => {
      const s = getDateState();
      s.from = fromInput.value;
      if (s.mode !== 'custom') s.mode = 'custom';
      modeSel.value = 'custom';
      saveDateState(s);
      updateLabel();
      onChange();
    };
  }

  if (toInput) {
    toInput.onchange = () => {
      const s = getDateState();
      s.to = toInput.value;
      if (s.mode !== 'custom') s.mode = 'custom';
      modeSel.value = 'custom';
      saveDateState(s);
      updateLabel();
      onChange();
    };
  }

  function updateCustomVisibility() {
    const show = modeSel.value === 'custom';
    const w1 = document.getElementById('customDateWrapper');
    const w2 = document.getElementById('customDateToWrapper');
    if (w1) w1.style.display = show ? 'flex' : 'none';
    if (w2) w2.style.display = show ? 'flex' : 'none';
  }

  function updateLabel() {
    if (!label) return;
    label.textContent = computeRange().label;
  }

  updateLabel();
}

export function refreshDateLabel() {
  const label = document.getElementById('dateRangeLabel');
  if (label) label.textContent = computeRange().label;
}