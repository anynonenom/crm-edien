const CACHE_NAME = "eiden-bms-v1";
const STATIC_ASSETS = ["/", "/index.html"];

// Install — cache shell
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache for navigation
self.addEventListener("fetch", e => {
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("/index.html"))
    );
  }
});

// Push notifications
self.addEventListener("push", e => {
  const data = e.data ? e.data.json() : { title: "EIDEN-BMS", body: "You have a new notification" };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "https://eiden-group.com/wp-content/uploads/2026/04/EIDEN-BMS.png",
      badge: "https://eiden-group.com/wp-content/uploads/2026/04/EIDEN-BMS.png",
      vibrate: [200, 100, 200],
      data: { url: "/" }
    })
  );
});

// Notification click — open the app
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) return clientList[0].focus();
      return clients.openWindow("/");
    })
  );
});
