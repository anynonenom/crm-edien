import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID
  };

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'service-worker-replace',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'firebase-messaging-sw.js',
            source: `
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

const firebaseConfig = ${JSON.stringify(firebaseConfig)};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

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

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const taskId = event.notification.data?.taskId;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
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

        if (clients.openWindow) {
          return clients.openWindow("/").then((client) => {
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
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
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