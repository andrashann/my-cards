/* Offline cache, so My Cards still opens in a shop with no signal.
 *
 * Cache first, because a card that loads instantly matters more here than
 * a card that is a version fresh; every hit also refreshes in the
 * background, so the next open picks up any change.
 *
 * Needs http(s). Opened as a file:// URL the page skips registration.
 */
const CACHE = 'qr-cards-v2';

/* Everything the page needs to run with no network at all. The two readers
   are included even though the page loads them lazily, so that scanning
   also works offline. */
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon.svg',
  'lib/codes.js',
  'vendor/qrcode-generator-1.4.4.js',
  'vendor/jsbarcode-3.11.6.all.min.js',
  'vendor/zxing-library-0.21.3.umd.min.js',
  'vendor/jsqr-1.4.0.js',
  'vendor/fonts/instrument-sans-latin.woff2',
  'vendor/fonts/instrument-sans-latin-ext.woff2',
  'vendor/fonts/ibm-plex-mono-latin.woff2',
  'vendor/fonts/ibm-plex-mono-latin-ext.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // One missing file must not fail the whole install, so these are
    // added independently rather than through addAll.
    await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Everything this page needs, fonts included, is served from this origin,
  // so anything off-origin is not ours and is left to the network.
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  if (!sameOrigin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });

    const fresh = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    });

    if (hit) {
      fresh.catch(() => {});   // refresh in the background, ignore failure
      return hit;
    }
    try {
      return await fresh;
    } catch (err) {
      // Offline with nothing cached: for a page request, hand back the
      // card list rather than the browser's own error page.
      if (req.mode === 'navigate') {
        const shell = await cache.match('index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
