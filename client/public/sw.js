// Handy Pioneers Field Estimator — Service Worker
// Strategy: cache-first for shell assets, network-first for API calls

const CACHE_NAME = 'hp-estimator-v1';

// App shell assets to pre-cache on install
const SHELL_ASSETS = [
  '/',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API, tRPC, or OAuth calls — always go to network
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/api/trpc') ||
    url.pathname.startsWith('/api/oauth')
  ) {
    return;
  }

  // For navigation requests (HTML), try network first, fall back to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    );
    return;
  }

  // For everything else: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Only cache same-origin successful GET responses
        if (
          response.ok &&
          request.method === 'GET' &&
          url.origin === self.location.origin
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
