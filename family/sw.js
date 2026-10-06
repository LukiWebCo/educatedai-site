// The Table's service worker (scope /family/): opt-in push notifications only. No caching, no fetch handler.
// A push carries {title, body, url, tag}: fixed words from jobs/notify.py, never anyone's post text.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (ev) => ev.waitUntil(self.clients.claim()));

self.addEventListener('push', (ev) => {
  let d = {};
  try { d = ev.data ? ev.data.json() : {}; } catch { d = {}; }
  const url = typeof d.url === 'string' && d.url.startsWith('/family/') ? d.url : '/family/';
  ev.waitUntil(self.registration.showNotification(String(d.title || 'The Table').slice(0, 60), {
    body: String(d.body || '').slice(0, 160),
    icon: '/family/claude-avatar.svg',
    badge: '/family/claude-avatar.svg',
    tag: String(d.tag || 'table'),
    data: { url },
  }));
});

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const url = (ev.notification.data && ev.notification.data.url) || '/family/';
  ev.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).pathname.startsWith('/family/')) { await c.focus(); return c.navigate(url); }
    }
    return self.clients.openWindow(url);
  })());
});
