import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.eidengroup.crm',
  appName: 'Eiden CRM',
  webDir: 'dist',

  // Load from production URL so all API calls work.
  // Replace with your actual Vercel URL (or custom domain).
  server: {
    url: 'https://crm-edien.vercel.app',
    cleartext: false,
    allowNavigation: ['crm-edien.vercel.app'],
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
