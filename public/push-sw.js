/* Adult Arize Web Push only. Deliberately NO fetch handler or private cache. */
self.addEventListener('push', event => {
  event.waitUntil(self.registration.showNotification('Arize', {
    body: 'A little space for you. Open Arize when you have a moment.',
    icon: '/design/founder/logo.png',
    tag: 'arize-daily-check-in',
    renotify: false,
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const home = new URL('/home', self.location.origin).href
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(home)
        return client.focus()
      }
    }
    return self.clients.openWindow(home)
  })())
})
