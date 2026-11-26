const cacheName = 'nova-memory-shell-v1';
const shell = ['./', './index.html', './styles.css', './app.js', './core.js', './vendor/zip.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell))));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) {
    if (name.startsWith('nova-memory-shell-') && name !== cacheName) await caches.delete(name);
  }
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (event.request.method !== 'GET' || !shell.some(path => new URL(path, self.registration.scope).href === url)) return;
  event.respondWith(caches.open(cacheName).then(cache =>
    cache.match(event.request).then(response => response || Response.error())));
});
