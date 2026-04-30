import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  getMessaging,
  Messaging,
  getToken,
  onMessage,
  isSupported
} from "firebase/messaging";

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;
let configPromise: Promise<any> | null = null;

const fetchFirebaseConfig = async () => {
  if (!configPromise) {
    configPromise = fetch("/api/firebase-config")
      .then(res => {
        if (!res.ok) throw new Error("Failed to load Firebase config");
        return res.json();
      })
      .catch(err => {
        configPromise = null;
        throw err;
      });
  }

  return configPromise;
};

export const initializeFirebase = async () => {
  if (app) return { app, messaging };

  const config = await fetchFirebaseConfig();

  if (!config?.projectId || !config?.apiKey) {
    throw new Error("Invalid Firebase config");
  }

  if (!getApps().length) {
    app = initializeApp(config);
  }

  if (await isSupported()) {
    messaging = getMessaging(app!);
  }

  return { app, messaging };
};

export const requestNotificationPermission = async () => {
  try {
    if (!messaging) {
      await initializeFirebase();
    }

    if (!messaging) return null;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const config = await fetchFirebaseConfig();

    return await getToken(messaging, {
      vapidKey: config.vapidKey
    });
  } catch (err) {
    console.error(err);
    return null;
  }
};

export const onMessageListener = async (callback?: (payload: any) => void) => {
  await initializeFirebase();

  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    console.log("Message received:", payload);

    callback?.(payload);

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