import { getSettings, saveSettings } from './config.js';

export function initTopTabs(onChange) {
  const tabs = document.querySelectorAll('.top-tab-btn');
  if (!tabs.length) return;

  const current = getSettings().topTab || 'overview';
  activate(current, false);

  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-top-tab');
      if (!tab) return;
      activate(tab, true);
      if (typeof onChange === 'function') onChange(tab);
    });
  });

  function activate(tab, persist) {
    tabs.forEach(b => {
      const isActive = b.getAttribute('data-top-tab') === tab;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    document.querySelectorAll('.top-panel').forEach(panel => {
      const isTarget = panel.id === `panel-${tab}`;
      panel.style.display = isTarget ? 'block' : 'none';
    });

    if (persist) saveSettings({ topTab: tab });
  }
}

export function switchTopTab(tab) {
  const btn = document.querySelector(`.top-tab-btn[data-top-tab="${tab}"]`);
  if (btn) btn.click();
}