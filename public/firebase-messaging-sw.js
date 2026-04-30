importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

// Firebase configuration - these will be injected by the build process
const firebaseConfig = {
  apiKey: "%VITE_FIREBASE_API_KEY%",
  authDomain: "%VITE_FIREBASE_AUTH_DOMAIN%",
  projectId: "%VITE_FIREBASE_PROJECT_ID%",
  storageBucket: "%VITE_FIREBASE_STORAGE_BUCKET%",
  messagingSenderId: "%VITE_FIREBASE_MESSAGING_SENDER_ID%",
  appId: "%VITE_FIREBASE_APP_ID%",
  measurementId: "%VITE_FIREBASE_MEASUREMENT_ID%"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log("Received background message:", payload);

  const notificationTitle = payload.notification?.title || "Eiden BMS";
  const notificationOptions = {
    body: payload.notification?.body || "",
    icon: payload.notification?.icon || "/icon-192.png",
    badge: "/badge-72.png",
    data: payload.data || {},
    tag: payload.data?.taskId || "notification",
    requireInteraction: true
  };

  // Show notification
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const taskId = event.notification.data?.taskId;
  const action = event.notification.data?.action;

  // Focus or open the app
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Try to focus an existing client
        for (const client of clientList) {
          if (client.url === self.location.origin && "focus" in client) {
            client.focus();
            // Send message to open task modal
            if (taskId) {
              client.postMessage({
                type: "OPEN_TASK_MODAL",
                taskId: taskId
              });
            }
            return;
          }
        }
        // If no focused client, open a new one
        if (clients.openWindow) {
          return clients.openWindow("/").then((client) => {
            if (taskId) {
              client.postMessage({
                type: "OPEN_TASK_MODAL",
                taskId: taskId
              });
            }
          });
        }
      })
  );
});
