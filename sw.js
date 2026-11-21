// Service Worker nur für Push-Nachrichten (kein Offline-Cache, damit Updates sofort ankommen)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'GIG Express', {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: d.tag || 'morgen',          // neue Morgen-Nachricht ersetzt die alte
    data: { url: d.url || self.registration.scope },
  }));
});

// Tippen öffnet die Seite (oder holt das offene Fenster nach vorne)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const w = list.find(c => c.url.startsWith(self.registration.scope));
    if (w) { w.postMessage({ goto: 'dash' }); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
