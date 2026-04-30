// Simple browser notification system (replaces Firebase Cloud Messaging)

let permission: NotificationPermission = "default";

export const requestNotificationPermission = async () => {
  if (!("Notification" in window)) {
    console.warn("This browser does not support notifications");
    return false;
  }

  permission = await Notification.requestPermission();
  return permission === "granted";
};

export const showBrowserNotification = (title: string, options?: NotificationOptions) => {
  if (!("Notification" in window)) {
    console.warn("This browser does not support notifications");
    return;
  }

  if (permission === "granted") {
    new Notification(title, {
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      requireInteraction: true,
      ...options
    });
  } else if (permission === "default") {
    // Request permission and show notification
    requestNotificationPermission().then((granted) => {
      if (granted) {
        showBrowserNotification(title, options);
      }
    });
  }
};

export const getNotificationPermission = () => permission;

export const isNotificationSupported = () => "Notification" in window;