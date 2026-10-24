// Cache only public application assets and Tesseract resources, never API responses.
const CACHE = 'biblio-offline-ocr-v1';
const RESOURCES = [
  '/tesseract/worker.min.js',
  '/tesseract/core/tesseract-core-lstm.wasm.js',
  '/tesseract/core/tesseract-core-simd-lstm.wasm.js',
  '/tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js',
  ...['spa', 'eng', 'por', 'fra', 'deu', 'ita'].map((lang) => `/tesseract/lang/${lang}.traineddata.gz`),
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(RESOURCES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('biblio-offline-ocr-') && key !== CACHE).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      (!url.pathname.startsWith('/tesseract/') && !url.pathname.startsWith('/assets/'))) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  }));
});
