const CACHE_NAME = 'mms-v1'
const URLS_TO_CACHE = ['/', '/dashboard', '/login']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and Supabase API calls
  if (event.request.method !== 'GET' || event.request.url.includes('supabase.co')) {
    return
  }

  // Network First strategy for pages, Cache First for static assets
  const isPage = event.request.mode === 'navigate' || 
                 event.request.headers.get('accept')?.includes('text/html')

  if (isPage) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
          return response
        })
        .catch(() => caches.match(event.request))
    )
  } else {
    // Cache First for other assets (JS, CSS, Images)
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
          return response
        })
      })
    )
  }
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const data = event.data.json()
    const options = {
      body: data.body || 'You have a new notification.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/'
      }
    }

    event.waitUntil(
      self.registration.showNotification(data.title || 'Mess Manage', options)
    )
  } catch (err) {
    console.error('Error processing push event:', err)
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const urlToOpen = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i]
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus()
        }
      }
      // If not, open a new window/tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen)
      }
    })
  )
})
