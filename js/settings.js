import { getSettings, saveSettings, resetSettings, CONFIG } from './config.js';
import { qs } from './utils.js';

/* ---------- Open/close ---------- */
export function openSettings() {
  const modal = qs('#settingsModal');
  if (!modal) return;
  hydrateForm();
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

export function closeSettings() {
  const modal = qs('#settingsModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

/* ---------- Hydrate form with current values ---------- */
function hydrateForm() {
  const s = getSettings();
  const set = (id, val) => { const el = qs('#' + id); if (el) el.value = val; };
  const check = (id, val) => { const el = qs('#' + id); if (el) el.checked = !!val; };

  set('settingWeekly', s.weeklyCapacityHours);
  set('settingDaily', s.dailyTargetHours);
  set('settingRows', s.defaultRowsPerPage);
  check('settingNotifications', s.notificationsEnabled);
  check('settingDailyReminder', s.dailyGoalReminder);
  check('settingEodSummary', s.eodSummary);

  const notifStatus = qs('#notifPermissionStatus');
  if (notifStatus && 'Notification' in window) {
    notifStatus.textContent = `Browser permission: ${Notification.permission}`;
  }
}

/* ---------- Save ---------- */
export async function saveSettingsFromForm() {
  const get = id => qs('#' + id);
  const weekly = parseFloat(get('settingWeekly').value) || 30;
  const daily = parseFloat(get('settingDaily').value) || 6;
  const rows = parseInt(get('settingRows').value, 10) || 30;
  const notifOn = get('settingNotifications').checked;
  const dailyOn = get('settingDailyReminder').checked;
  const eodOn = get('settingEodSummary').checked;

  // Request permission if user enabled notifications
  if (notifOn && 'Notification' in window && Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      Swal.fire({
        icon: 'warning',
        title: 'Notifications blocked',
        text: 'Browser denied notification permission. Enable it in site settings to receive alerts.',
        confirmButtonColor: '#0284c7',
      });
    }
  }

  saveSettings({
    weeklyCapacityHours: weekly,
    dailyTargetHours: daily,
    defaultRowsPerPage: rows,
    notificationsEnabled: notifOn,
    dailyGoalReminder: dailyOn,
    eodSummary: eodOn,
  });

  Swal.fire({
    icon: 'success',
    title: 'Settings saved',
    timer: 1000,
    showConfirmButton: false,
  });
}

/* ---------- Reset ---------- */
export function resetSettingsFromForm() {
  resetSettings();
  hydrateForm();
  Swal.fire({
    icon: 'success',
    title: 'Reset to defaults',
    timer: 1000,
    showConfirmButton: false,
  });
}

/* ---------- Notifications helper ---------- */
export function notify(title, body, tag) {
  const s = getSettings();
  if (!s.notificationsEnabled) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag, icon: '/favicon.ico' });
  } catch (_) { /* ignore */ }
}

/* ---------- Daily checks (call on load) ---------- */
export function runDailyChecks(stats) {
  const s = getSettings();
  if (!s.notificationsEnabled) return;

  const todayKey = new Date().toISOString().slice(0, 10);
  const lastDaily = localStorage.getItem('last_daily_notif');
  const lastEod = localStorage.getItem('last_eod_notif');

  // Daily goal reminder (fires once per day)
  if (s.dailyGoalReminder && lastDaily !== todayKey) {
    notify(
      '🌅 Good morning',
      `Today's goal: ${CONFIG.DAILY_TARGET_HOURS} hrs. Let's get started!`,
      'daily-reminder'
    );
    localStorage.setItem('last_daily_notif', todayKey);
  }

  // End-of-day summary (fires after 17:00 once per day)
  const hour = new Date().getHours();
  if (s.eodSummary && hour >= 17 && lastEod !== todayKey && stats) {
    notify(
      '🌆 End-of-day summary',
      `Logged ${stats.todayHours.toFixed(1)} hrs today. ${stats.todayActive} active, ${stats.todayCompleted} completed.`,
      'eod-summary'
    );
    localStorage.setItem('last_eod_notif', todayKey);
  }
}