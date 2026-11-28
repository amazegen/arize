/* Adult Arize Web Push only. NO fetch handler or private-page cache. */
// Diagnostics are inert outside this exact disposable localhost origin.
const localDiagnostics = self.location.origin === 'http://127.0.0.1:3190'
const diagnosticRevision = 'local-diagnostics-2026-11-25-v1'
const diagnosticCache = 'arize-local-push-diagnostics-v1'
const diagnosticPath = '/__arize_local_push_receipts__'
const diagnosticStages = ['worker_activated', 'push_received', 'display_requested', 'display_resolved', 'display_failed', 'notification_clicked', 'navigation_resolved', 'navigation_failed']
const diagnosticErrors = ['NotAllowedError', 'InvalidStateError', 'TypeError', 'AbortError', 'UnknownError']
let diagnosticQueue = Promise.resolve()
async function diagnosticRows(cache) {
  const response = await cache.match(diagnosticPath)
  if (!response) return []
  const text = await response.text()
  let rows
  try { rows = text.length <= 16384 ? JSON.parse(text) : [] } catch { rows = [] }
  if (!Array.isArray(rows)) rows = []
  const now = Date.now()
  const clean = rows.slice(-64).filter(row => row && typeof row.at === 'string'
    && Date.parse(row.at) >= now - 86400000 && Date.parse(row.at) <= now + 60000
    && typeof row.eventId === 'string' && /^[a-f0-9-]{36}$/.test(row.eventId)
    && diagnosticStages.includes(row.stage) && (row.error === null || [...diagnosticErrors, 'OtherError'].includes(row.error)))
    .map(({ at, eventId, stage, error }) => ({ at, eventId, stage, error }))
  // Also prune stored metadata on reads, not just the next delivered push.
  if (JSON.stringify(clean) !== text) await cache.put(diagnosticPath, new Response(JSON.stringify(clean), { headers: { 'Content-Type': 'application/json' } }))
  return clean
}
function diagnosticNote(stage, eventId, error = null) {
  if (!localDiagnostics) return Promise.resolve()
  // Only fixed stage/error labels. Never payloads, endpoints, keys or raw errors.
  const row = { at: new Date().toISOString(), eventId, stage, error: error ? (diagnosticErrors.includes(error.name) ? error.name : 'OtherError') : null }
  diagnosticQueue = diagnosticQueue.then(async () => {
    const cache = await caches.open(diagnosticCache)
    const rows = await diagnosticRows(cache)
    await cache.put(diagnosticPath, new Response(JSON.stringify([...rows, row].slice(-64)), { headers: { 'Content-Type': 'application/json' } }))
  }).catch(() => undefined)
  return diagnosticQueue
}
async function diagnosticDeadline(promise) {
  if (!localDiagnostics) return promise
  let timer
  try { return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(null), 1000) })]) }
  finally { clearTimeout(timer) }
}
self.addEventListener('install', event => {
  if (localDiagnostics) event.waitUntil(self.skipWaiting())
})
self.addEventListener('activate', event => {
  if (localDiagnostics) event.waitUntil(Promise.all([self.clients.claim(), diagnosticDeadline(diagnosticNote('worker_activated', crypto.randomUUID()))]))
})
self.addEventListener('message', event => {
  if (!localDiagnostics || !event.ports || event.ports.length !== 1 || !event.source) return
  let source
  try { source = new URL(event.source.url) } catch { return }
  if (source.origin !== self.location.origin || source.pathname !== '/local/push-diagnostics'
    || event.data?.type !== 'ARIZE_LOCAL_PUSH_DIAGNOSTICS_READ' || event.data?.version !== 1) return
  event.waitUntil((async () => {
    const snapshot = diagnosticQueue.then(async () => {
      try { return { storageAvailable: true, events: await diagnosticRows(await caches.open(diagnosticCache)) } }
      catch { return { storageAvailable: false, events: [] } }
    })
    diagnosticQueue = snapshot.then(() => undefined).catch(() => undefined)
    const result = await diagnosticDeadline(snapshot)
    event.ports[0].postMessage({ version: 1, revision: diagnosticRevision, ...(result || { storageAvailable: false, events: [] }) })
  })())
})
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    const eventId = localDiagnostics ? crypto.randomUUID() : ''
    void diagnosticNote('push_received', eventId)
    void diagnosticNote('display_requested', eventId)
    try {
      await self.registration.showNotification('Arize', {
        body: 'A little space for you. Open Arize when you have a moment.',
        icon: '/design/founder/logo.png',
        tag: 'arize-daily-check-in',
        renotify: false,
      })
      await diagnosticDeadline(diagnosticNote('display_resolved', eventId))
    } catch (error) {
      await diagnosticDeadline(diagnosticNote('display_failed', eventId, error))
      throw error
    }
  })())
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const eventId = localDiagnostics ? crypto.randomUUID() : ''
    void diagnosticNote('notification_clicked', eventId)
    try {
    const home = new URL('/home', self.location.origin).href
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(home)
        await client.focus()
        await diagnosticDeadline(diagnosticNote('navigation_resolved', eventId))
        return
      }
    }
    await self.clients.openWindow(home)
    await diagnosticDeadline(diagnosticNote('navigation_resolved', eventId))
    } catch (error) {
      await diagnosticDeadline(diagnosticNote('navigation_failed', eventId, error))
      throw error
    }
  })())
})
