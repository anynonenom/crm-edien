import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getMessaging, Messaging, getToken, onMessage, isSupported } from "firebase/messaging";

// Firebase configuration - replace with your actual Firebase project credentials
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.VITE_FIREBASE_APP_ID || "",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || ""
};

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

export const initializeFirebase = async () => {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  }
  
  const supported = await isSupported();
  if (supported) {
    messaging = getMessaging(app);
  }
  
  return { app, messaging };
};

export const requestNotificationPermission = async () => {
  if (!messaging) return null;
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const token = await getToken(messaging, {
        vapidKey: process.env.VITE_FIREBASE_VAPID_KEY || ""
      });
      return token;
    }
  } catch (error) {
    console.error("Error requesting notification permission:", error);
  }
  return null;
};

export const onMessageListener = () => {
  if (!messaging) return () => {};
  
  return onMessage(messaging, (payload) => {
    console.log("Message received:", payload);
    // Handle foreground messages
    if (payload.notification) {
      new Notification(payload.notification.title || "Notification", {
        body: payload.notification.body,
        icon: payload.notification.icon,
        data: payload.data
      });
    }
  });
};

export { messaging };
