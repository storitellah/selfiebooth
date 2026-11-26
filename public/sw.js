/* Offline support for Selfie Studio by Storitellah.
   The app's own files are stored on first visit. Pages are fetched from the
   network first, so a new version shows on the next load, and the stored copy
   is used when there is no connection. Fonts and libraries from other sites are
   stored the first time they load. */
const VERSION = '2026.11.26';
const CACHE = 'selfie-studio-' + VERSION;
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "install.js",
  "faq.html",
  "privacy.html",
  "css/styles.css",
  "js/app.js",
  "js/camera.js",
  "js/config.js",
  "js/device.js",
  "js/filters.js",
  "js/layout.js",
  "js/printing.js",
  "js/stickers.js",
  "icon.svg",
  "icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png"
];
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(SHELL.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('selfie-studio-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !RUNTIME_HOSTS.includes(url.hostname)) return;
  if (sameOrigin && url.pathname.includes('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./')))
    );
    return;
  }

  // Stored copy first for speed, refreshed in the background.
  event.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req, { ignoreSearch: sameOrigin }).then(hit => {
        const network = fetch(req)
          .then(res => {
            if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || network;
      })
    )
  );
});
