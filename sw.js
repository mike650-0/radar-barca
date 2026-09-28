/* Radar Barça · service worker
   - appli (index.html) et données (data.json) : réseau d'abord, copie locale si pas de connexion
   - polices et icônes : copie locale d'abord
   Changer VERSION quand un fichier de l'appli (hors data.json) est modifié. */
const VERSION = 'radar-barca-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'data.json',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png',
  'bc-600.woff2', 'bc-700.woff2', 'ps-400.woff2', 'ps-600.woff2', 'ps-700.woff2', 'mono-400.woff2'];

const scoped = (p) => new URL(p, self.registration.scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromCache(res) {
  const h = new Headers(res.headers);
  h.set('x-radar-source', 'cache');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

async function networkFirst(fetcher, key, ms) {
  const cache = await caches.open(VERSION);
  const net = fetcher().then((res) => {
    if (res && res.ok) cache.put(key, res.clone());
    return res;
  });
  net.catch(() => {});
  const timer = new Promise((resolve) => setTimeout(() => resolve('timeout'), ms));
  try {
    const first = await Promise.race([net, timer]);
    if (first !== 'timeout') return first;
  } catch (err) { /* réseau en échec : on tente la copie locale */ }
  const hit = await cache.match(key);
  if (hit) return fromCache(hit);
  return net;
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(() => fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }), scoped('index.html'), 3500));
    return;
  }
  if (url.pathname.endsWith('/data.json')) {
    e.respondWith(networkFirst(() => fetch(req), scoped('data.json'), 3500));
    return;
  }
  if (url.pathname.endsWith('/sw.js')) return;
  e.respondWith(cacheFirst(req));
});
