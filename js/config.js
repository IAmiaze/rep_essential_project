const LS_SETTINGS = 'app_settings';

const DEFAULT_SETTINGS = {
  weeklyCapacityHours: 30,
  dailyTargetHours: 6,
  defaultRowsPerPage: 30,
  notificationsEnabled: false,
  dailyGoalReminder: true,
  eodSummary: true,
  dateRangeMode: 'current_month',
  useTargetDateForAttribution: true,
  topTab: 'overview',   // 'overview' | 'tasks' | 'analytics'
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

export const CONFIG = {
  API_VERSION: '7.1-preview.3',
  WIQL_API_VERSION: '7.1-preview.2',
  WIQL_PAGE_SIZE: 200,
  WORKITEMS_BATCH_SIZE: 200,
  REVISION_CONCURRENCY: 5,

  WEEKLY_CAPACITY_HOURS: DEFAULT_SETTINGS.weeklyCapacityHours,
  DAILY_TARGET_HOURS: DEFAULT_SETTINGS.dailyTargetHours,
  DEFAULT_ROWS_PER_PAGE: DEFAULT_SETTINGS.defaultRowsPerPage,
  USE_TARGET_DATE_FOR_ATTRIBUTION: DEFAULT_SETTINGS.useTargetDateForAttribution,

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
  CONFIG.USE_TARGET_DATE_FOR_ATTRIBUTION = s.useTargetDateForAttribution;
}

applySettingsToConfig();