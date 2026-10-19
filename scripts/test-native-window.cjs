const { app } = require('electron');
const { createChatWindow } = require('../chat-window');
const path = require('path'),
  { execFile } = require('child_process');
const runFile = require('util').promisify(execFile);
app.setPath(
  'userData',
  path.join(app.getPath('temp'), `kaia-native-window-test-${process.pid}`),
);
app
  .whenReady()
  .then(async () => {
    const win = createChatWindow({
      width: 510,
      height: 650,
      x: 20,
      y: 20,
      title: 'Kaia Chat — teste de encaixe',
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#0d1019', symbolColor: '#eee', height: 47 },
      resizable: true,
      maximizable: true,
      webPreferences: { sandbox: true, contextIsolation: true },
    });
    await win.webContents.loadURL(
      'data:text/html,<html><body style="margin:0;background:transparent"><header style="height:48px;-webkit-app-region:drag;background:%230d1019;color:white">Kaia Chat — teste de encaixe</header></body></html>',
    );
    const hwnd = win.getNativeWindowHandle().readBigUInt64LE().toString();
    const native = JSON.parse(
      (
        await runFile(
          path.resolve('.runtime/python/python.exe'),
          ['backend/native_frame_probe.py', hwnd],
          { encoding: 'utf8', windowsHide: true },
        )
      ).stdout,
    );
    const id = win.webContents.id;
    await win.webContents.executeJavaScript('window.preservedValue=42');
    win.setOverlayMode(true);
    await new Promise((r) => setTimeout(r, 100));
    const overlay = JSON.parse(
      (
        await runFile(
          path.resolve('.runtime/python/python.exe'),
          [
            'backend/native_frame_probe.py',
            win
              .getGameWindow()
              .getNativeWindowHandle()
              .readBigUInt64LE()
              .toString(),
          ],
          { encoding: 'utf8', windowsHide: true },
        )
      ).stdout,
    );
    const sameRenderer =
      win.webContents.id === id &&
      (await win.webContents.executeJavaScript('window.preservedValue===42'));
    win.setOverlayMode(false);
    await new Promise((r) => setTimeout(r, 100));
    win.maximize();
    await new Promise((r) => setTimeout(r, 450));
    const maximized = win.isMaximized();
    win.unmaximize();
    await new Promise((r) => setTimeout(r, 300));
    const result = {
      native,
      clickThrough: overlay.clickThrough,
      sameRenderer,
      maximized,
      restored: !win.isMaximized(),
    };
    console.log(JSON.stringify(result));
    win.destroy();
    app.exit(
      native.nativeSnapButton &&
        overlay.clickThrough &&
        sameRenderer &&
        maximized &&
        result.restored
        ? 0
        : 1,
    );
  })
  .catch((e) => {
    console.error(e);
    app.exit(1);
  });
