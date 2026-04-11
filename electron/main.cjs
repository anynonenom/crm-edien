const { app, BrowserWindow, shell, Menu, nativeImage } = require('electron');
const path = require('path');

// Production URL — change to your custom domain if you have one
const APP_URL = 'https://crm-edien.vercel.app';

function createWindow() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../public/icons/icon-512.png'));

  const win = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    icon,
    title: 'Eiden CRM',
    backgroundColor: '#122620',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    // macOS-style frameless titlebar
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  // Remove default menu bar (keeps native OS window controls)
  Menu.setApplicationMenu(null);

  win.loadURL(APP_URL);

  // Open all external links in the default browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Show window only when content is ready (no white flash)
  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
