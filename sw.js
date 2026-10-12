/* =========================================================================
   Service Worker — Azure DevOps Dashboard PWA
   Strategy:
   - Cache-first for static assets (HTML, CSS, JS, icons)
   - Network-only for Azure DevOps API calls (never cache PAT-authenticated responses)
   ========================================================================= */

const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `azure-dashboard-${CACHE_VERSION}`;

// Assets to precache on install (app shell)
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './js/config.js',
  './js/utils.js',
  './js/api.js',
  './js/state.js',
  './js/keyboard.js',
  './js/render.js',
  './js/charts.js',
  './js/productivity.js',
  './js/pomodoro.js',
  './js/settings.js',
  './js/iteration.js',
  './js/details.js',
  './js/export.js',
  './js/timetracking.js',
];

// CDN assets to cache on first use (Chart.js, SweetAlert2)
const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
];

// Never cache these (auth-sensitive)
const NEVER_CACHE = [
  'dev.azure.com',
  '/_apis/',
];

/* ---------- Install ---------- */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('[SW] Precache partial failure:', err);
      }))
  );
});

/* ---------- Activate ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('azure-dashboard-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ---------- Fetch ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET
  if (req.method !== 'GET') return;

  // Never cache Azure DevOps API calls
  if (NEVER_CACHE.some(pattern => url.href.includes(pattern))) {
    return; // default browser behavior
  }

  // Cache-first strategy for everything else
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        // Refresh in background if stale (stale-while-revalidate for CDN)
        if (url.hostname.includes('cdn.jsdelivr.net')) {
          fetch(req).then(res => {
            if (res && res.ok) {
              caches.open(CACHE_NAME).then(cache => cache.put(req, res));
            }
          }).catch(() => {});
        }
        return cached;
      }

      return fetch(req).then(res => {
        // Cache successful responses (same-origin or CDN)
        if (
          res &&
          res.ok &&
          (url.origin === self.location.origin || url.hostname.includes('cdn.jsdelivr.net'))
        ) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return res;
      }).catch(() => {
        // Offline fallback for navigation requests → serve index.html
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

/* ---------- Message: force update ---------- */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});