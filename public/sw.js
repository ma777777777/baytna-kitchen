// Baytna Kitchen service worker: makes the app open offline.
// App files: network first, falling back to cache. Hashed assets and fonts: cache first.
// Supabase API calls are never cached here (the app keeps its own offline copy of data).
const CACHE = 'baytna-v2'
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/apple-touch-icon.png']

// Cache the shell plus the hashed JS/CSS that index.html references, so a reload works offline.
async function precache() {
  const c = await caches.open(CACHE)
  await c.addAll(SHELL)
  const html = await (await fetch('/', { cache: 'no-store' })).text()
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
  await c.addAll(assets)
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  const sameOrigin = url.origin === self.location.origin
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
  if (!sameOrigin && !isFont) return

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/', copy))
          // a new deploy: make sure its assets are cached too
          precache().catch(() => {})
          return res
        })
        .catch(() => caches.match('/', { ignoreVary: true })),
    )
    return
  }

  if (isFont || url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req, { ignoreVary: true }).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok || res.type === 'opaque') {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() => caches.match(req, { ignoreVary: true })),
  )
})
