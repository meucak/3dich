// 3dich — Lightweight Offline-First Service Worker (PWA)
const CACHE_NAME = '3dich-v1.0.0';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './favicon.svg',
  './manifest.webmanifest',
  './js/app.js',
  './js/catalog.js',
  './js/physics_engine.js',
  './js/math3d.js',
  './js/camera.js',
  './js/procedural_meshes.js',
  './js/mesh_parsers.js',
  './js/mesh_worker.js',
  './js/gizmo.js',
  './js/renderer_webgl.js',
  './js/renderer_canvas2d.js',
  './js/gemini_studio.js',
  './js/solidcraft_bridge.js',
  './js/storage.js',
  './js/i18n.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((resp) => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return resp;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});
