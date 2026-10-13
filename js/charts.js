let hoursChartInstance = null;
let stateChartInstance = null;
let hoursChartBigInstance = null;
let stateChartBigInstance = null;

const CHART_COLORS = {
  accent: '#0284c7',
  green: '#4ade80',
  yellow: '#eab308',
  blue: '#60a5fa',
  rose: '#f43f5e',
  grid: 'rgba(148, 163, 184, 0.15)',
  text: '#94a3b8',
};

export function renderAnalytics(tasks) {
  renderHoursChart(tasks, 'hoursChart', '7');
  renderStateChart(tasks, 'stateChart');
}

export function renderAnalyticsBig(tasks) {
  renderHoursChart(tasks, 'hoursChartBig', '30');
  renderStateChart(tasks, 'stateChartBig');
}

function renderHoursChart(tasks, canvasId, range) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const days = [];
  const labels = [];
  const totals = [];
  const today = new Date();
  const count = range === '30' ? 30 : 7;

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push(key);
    labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    totals.push(0);
  }

  const map = new Map();
  days.forEach((d, i) => map.set(d, i));
  tasks.forEach(t => {
    const date = t.attributionDate || t.changedDate;
    if (map.has(date)) totals[map.get(date)] += t.totalCompleted || 0;
  });

  // Destroy old
  const old = range === '30' ? hoursChartBigInstance : hoursChartInstance;
  if (old) old.destroy();

  const instance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Hours',
        data: totals.map(v => Math.round(v * 10) / 10),
        backgroundColor: CHART_COLORS.accent,
        borderRadius: 6,
        maxBarThickness: 40,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} hrs` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: CHART_COLORS.text, font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text, font: { size: 11 } } },
      },
    },
  });

  if (range === '30') hoursChartBigInstance = instance; else hoursChartInstance = instance;
}

function renderStateChart(tasks, canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const buckets = { New: 0, Active: 0, Closed: 0, Other: 0 };
  const closedStates = ['closed', 'done', 'completed', 'resolved'];
  const newStates = ['new', 'to do', 'proposed', 'not started'];

  tasks.forEach(t => {
    const s = String(t.state || '').toLowerCase();
    if (closedStates.includes(s)) buckets.Closed++;
    else if (newStates.includes(s)) buckets.New++;
    else if (s) buckets.Active++;
    else buckets.Other++;
  });

  const labels = Object.keys(buckets).filter(k => buckets[k] > 0);
  const data = labels.map(k => buckets[k]);
  const colors = { New: CHART_COLORS.blue, Active: CHART_COLORS.yellow, Closed: CHART_COLORS.green, Other: CHART_COLORS.text };

  const old = canvasId === 'stateChartBig' ? stateChartBigInstance : stateChartInstance;
  if (old) old.destroy();

  const instance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: labels.map(l => colors[l]), borderWidth: 0, hoverOffset: 6 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { color: CHART_COLORS.text, font: { size: 11 }, padding: 12, boxWidth: 10 } },
      },
    },
  });

  if (canvasId === 'stateChartBig') stateChartBigInstance = instance; else stateChartInstance = instance;
}