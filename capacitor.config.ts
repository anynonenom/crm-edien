import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.eidengroup.bms',
  appName: 'Eiden BMS',
  webDir: 'dist',

  // Load from production URL so all API calls work.
  // Replace with your actual Vercel URL (or custom domain).
  server: {
    url: 'https://bms.eiden-group.com',
    cleartext: false,
    allowNavigation: ['bms.eiden-group.com'],
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#122620',
      showSpinner: false,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#122620',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },

  android: {
    backgroundColor: '#122620',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  ios: {
    contentInset: 'always',
    backgroundColor: '#122620',
    preferredContentMode: 'mobile',
  },
};

export default config;
