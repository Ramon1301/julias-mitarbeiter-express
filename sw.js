// Service Worker: Push-Nachrichten + Offline-Bildschirm.
// Kein Cache für die Seite selbst – sie kommt immer frisch aus dem Netz, damit Updates sofort ankommen.
// Nur wenn gar kein Netz da ist, zeigt er offline.html (mit dem gespeicherten Video).
const OFF_CACHE = 'gig-offline-v1';
const OFF_FILES = ['offline.html', 'assets/offline-spot.mp4', 'icons/app-192.png'];
self.addEventListener('install', e => e.waitUntil(
  caches.open(OFF_CACHE).then(c => c.addAll(OFF_FILES)).catch(() => {}).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('gig-offline-') && k !== OFF_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;   // alles andere läuft ganz normal
  e.respondWith(fetch(e.request).catch(async () => (await caches.match('offline.html')) || Response.error()));
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'GIG Express', {
    body: d.body || '',
    icon: 'icons/app-192.png',
    badge: 'icons/app-192.png',
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
