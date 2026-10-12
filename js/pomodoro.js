const LS_POMO = 'pomodoro_state';
const FOCUS_SEC = 25 * 60;
const BREAK_SEC = 5 * 60;

let timer = null;
let state = loadState();

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(LS_POMO)) ||
      { mode: 'idle', secondsLeft: FOCUS_SEC, completedToday: 0, day: todayKey() };
  } catch {
    return { mode: 'idle', secondsLeft: FOCUS_SEC, completedToday: 0, day: todayKey() };
  }
}

function saveState() {
  localStorage.setItem(LS_POMO, JSON.stringify(state));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function initPomodoro() {
  // Reset daily count if new day
  if (state.day !== todayKey()) {
    state.completedToday = 0;
    state.day = todayKey();
    saveState();
  }
  render();
  if (state.mode === 'focus' || state.mode === 'break') {
    startTicking();
  }
}

function startTicking() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    state.secondsLeft--;
    if (state.secondsLeft <= 0) {
      handleComplete();
    }
    saveState();
    render();
  }, 1000);
}

function handleComplete() {
  clearInterval(timer);
  timer = null;
  playBeep();

  if (state.mode === 'focus') {
    state.completedToday++;
    state.mode = 'break';
    state.secondsLeft = BREAK_SEC;
    notify('Focus session complete!', 'Time for a 5-minute break.');
  } else {
    state.mode = 'idle';
    state.secondsLeft = FOCUS_SEC;
    notify('Break over', 'Ready for the next focus session?');
  }
  saveState();
  render();
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc.start();
    osc.stop(ctx.currentTime + 1.2);
  } catch (_) { /* audio unsupported — silent */ }
}

function notify(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

/* ---------- Public controls ---------- */
export function pomodoroStart() {
  if (state.mode === 'idle') state.mode = 'focus';
  startTicking();
  render();
}

export function pomodoroPause() {
  if (timer) clearInterval(timer);
  timer = null;
  render();
}

export function pomodoroReset() {
  if (timer) clearInterval(timer);
  timer = null;
  state.mode = 'idle';
  state.secondsLeft = FOCUS_SEC;
  saveState();
  render();
}

export function pomodoroRequestPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/* ---------- Render ---------- */
function render() {
  const el = document.getElementById('pomodoroDisplay');
  if (!el) return;
  const m = Math.floor(state.secondsLeft / 60);
  const s = String(state.secondsLeft % 60).padStart(2, '0');
  el.textContent = `${m}:${s}`;

  const modeEl = document.getElementById('pomodoroMode');
  if (modeEl) {
    modeEl.textContent =
      state.mode === 'focus' ? '🎯 Focus' :
      state.mode === 'break' ? '☕ Break' :
      'Ready';
  }

  const countEl = document.getElementById('pomodoroCount');
  if (countEl) countEl.textContent = `${state.completedToday} today`;
}