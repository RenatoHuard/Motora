// Motora — Service Worker para cache de tiles de mapa offline
const TILE_CACHE = 'motora-tiles-v1'

const TILE_HOSTS = [
  'tile.openstreetmap.org',
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
  'server.arcgisonline.com',
]

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', event => {
  try {
    const url = new URL(event.request.url)
    if (!TILE_HOSTS.includes(url.hostname)) return

    event.respondWith(
      caches.open(TILE_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          // Cache hit — return immediately and refresh in background
          if (cached) {
            fetch(event.request)
              .then(res => { if (res.ok) cache.put(event.request, res) })
              .catch(() => {})
            return cached
          }
          // Cache miss — fetch, store and return
          return fetch(event.request).then(res => {
            if (res.ok) cache.put(event.request, res.clone())
            return res
          }).catch(() => new Response('', { status: 503, statusText: 'Offline' }))
        })
      )
    )
  } catch {}
})
