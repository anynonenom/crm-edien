import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),

      {
        name: 'service-worker-build',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'firebase-messaging-sw.js',
            source: `
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

let firebaseConfig = null;
let messaging = null;

// Fetch Firebase config from API
fetch('/api/firebase-config')
  .then(res => res.json())
  .then(config => {
    firebaseConfig = config;
    try {
      firebase.initializeApp(firebaseConfig);
      messaging = firebase.messaging();
    } catch (error) {
      console.error("Firebase SW initialization error:", error);
    }
  })
  .catch(error => {
    console.error("Failed to fetch Firebase config in SW:", error);
  });

messaging.onBackgroundMessage((payload) => {
  console.log("Background message:", payload);

  const title = payload.notification?.title || "Eiden BMS";

  const options = {
    body: payload.notification?.body || "",
    icon: payload.notification?.icon || "/icon-192.png",
    badge: "/badge-72.png",
    data: payload.data || {},
    tag: payload.data?.taskId || "notification",
    requireInteraction: true
  };

  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const taskId = event.notification.data?.taskId;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url === self.location.origin && "focus" in client) {
            client.focus();

            if (taskId) {
              client.postMessage({
                type: "OPEN_TASK_MODAL",
                taskId
              });
            }
            return;
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow("/").then((client) => {
            if (taskId) {
              client.postMessage({
                type: "OPEN_TASK_MODAL",
                taskId
              });
            }
          });
        }
      })
  );
});
`
          });
        }
      }
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },

    build: {
      assetsDir: 'assets',
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith('.js')) {
              return 'assets/[name]-[hash][extname]';
            }
            if (assetInfo.name?.endsWith('.css')) {
              return 'assets/[name]-[hash][extname]';
            }
            return 'assets/[name]-[hash][extname]';
          },
        },
      },
    },
  };
});