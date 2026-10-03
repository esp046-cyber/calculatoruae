const STATIC = 'aedphp-static-v2';   // bump this when you change any file
const DATA = 'aedphp-data';          // last known exchange-rate response
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.json', './icon.svg', './apple-touch-icon.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(STATIC).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== STATIC && k !== DATA).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Exchange rate: network first, fall back to last cached response
  if (url.hostname === 'open.er-api.com') {
    e.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(DATA).then(c => c.put(req, copy)); return res; })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Static assets: cache first, then network; offline navigations get the app shell
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).catch(() => req.mode === 'navigate' ? caches.match('./index.html') : undefined))
    );
  }
});
