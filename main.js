const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { getUsage, getSessions } = require('./usage');

function createCard() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 340;
  const height = 340; // resized to fit content by the renderer

  const win = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 20,
    y: workArea.y + workArea.height - height - 20,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 'screen-saver' level keeps the card above fullscreen apps too
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile('index.html');
}

ipcMain.on('close-card', () => app.quit());
ipcMain.handle('get-usage', () => getUsage());
ipcMain.handle('get-sessions', () => getSessions());

// grow/shrink the window to the content while keeping its bottom edge in place
ipcMain.on('fit-height', (event, h) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const b = win.getBounds();
  const next = Math.ceil(h);
  if (next === b.height) return;
  win.setBounds({ x: b.x, y: b.y + b.height - next, width: b.width, height: next });
});

app.whenReady().then(createCard);
app.on('window-all-closed', () => app.quit());
