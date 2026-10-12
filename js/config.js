// Central configuration — single source of truth for tunables.
// Some values are overridable via Settings (persisted in localStorage).

const LS_SETTINGS = 'app_settings';

const DEFAULT_SETTINGS = {
  weeklyCapacityHours: 30,
  dailyTargetHours: 6,
  defaultRowsPerPage: 30,
  notificationsEnabled: false,
  dailyGoalReminder: true,
  eodSummary: true,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch) {
  const merged = { ...loadSettings(), ...patch };
  localStorage.setItem(LS_SETTINGS, JSON.stringify(merged));
  applySettingsToConfig();
  return merged;
}

export function getSettings() {
  return loadSettings();
}

export function resetSettings() {
  localStorage.removeItem(LS_SETTINGS);
  applySettingsToConfig();
  return { ...DEFAULT_SETTINGS };
}

// CONFIG is mutable at runtime via settings
export const CONFIG = {
  API_VERSION: '7.1-preview.3',
  WIQL_API_VERSION: '7.1-preview.2',

  WIQL_PAGE_SIZE: 200,
  WORKITEMS_BATCH_SIZE: 200,
  REVISION_CONCURRENCY: 5,

  // Mutable via settings
  WEEKLY_CAPACITY_HOURS: DEFAULT_SETTINGS.weeklyCapacityHours,
  DAILY_TARGET_HOURS: DEFAULT_SETTINGS.dailyTargetHours,
  DEFAULT_ROWS_PER_PAGE: DEFAULT_SETTINGS.defaultRowsPerPage,

  MAX_RETRIES: 3,
  RETRY_BASE_MS: 400,

  CLOSED_STATES: ['closed', 'done', 'completed', 'resolved', 'removed'],
  NEW_STATES:    ['new', 'to do', 'proposed', 'not started'],

  LS: {
    ORG: 'azure_org',
    EMAIL: 'azure_email',
    PAT: 'azure_pat',
    THEME: 'app_theme',
    SETTINGS: LS_SETTINGS,
  },
};

export function applySettingsToConfig() {
  const s = loadSettings();
  CONFIG.WEEKLY_CAPACITY_HOURS = s.weeklyCapacityHours;
  CONFIG.DAILY_TARGET_HOURS = s.dailyTargetHours;
  CONFIG.DEFAULT_ROWS_PER_PAGE = s.defaultRowsPerPage;
}

// Apply on module load
applySettingsToConfig();