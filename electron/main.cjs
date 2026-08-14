"use strict";

/**
 * Prism Desktop 鈥?Electron shell (product definition v2).
 *
 * Double-click to run: this main process starts the bundled Node server
 * (dist/index.js) on a free localhost port, waits for it to become healthy,
 * then opens the dashboard window pointed at it. The server runs inside the
 * Electron process thanks to ELECTRON_RUN_AS_NODE, so users never install
 * Node or touch a terminal.
 *
 * Usage (development):   npm run app
 * Packaging:             electron-builder (see README "Desktop app" section)
 */

const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { getFreePort, waitForHealth } = require("./server-host.cjs");

const isDev = !app.isPackaged;

let serverChild = null;
let mainWindow = null;

/** Start the Prism Node server and return the port it listens on. */
async function startPrismServer() {
  const port = await getFreePort();
  const serverEntry = isDev
    ? path.join(__dirname, "..", "dist", "index.js")
    : path.join(process.resourcesPath, "app", "dist", "index.js");

  // ELECTRON_RUN_AS_NODE makes the Electron binary behave as plain Node,
  // so no separate Node runtime is required on the user's machine.
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    DASHBOARD_PORT: String(port),
    PRISM_DESKTOP: "1",
  };
  serverChild = spawn(process.execPath, [serverEntry], {
    env,
    stdio: "inherit",
  });
  serverChild.on("exit", () => {
    serverChild = null;
  });

  await waitForHealth(`http://127.0.0.1:${port}/health`, 25000);
  return port;
}

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: "Prism Studio",
    autoHideMenuBar: true,
    backgroundColor: "#F5F6F8",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(`http://127.0.0.1:${port}/`);
  // External links open in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.on("closed", () => {
    mainWindow = null;
  });
  return win;
}

// Single instance: focus the existing window when the app is launched again.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      const port = await startPrismServer();
      mainWindow = createWindow(port);
    } catch (err) {
      dialog.showErrorBox(
        "Prism 鍚姩澶辫触",
        err instanceof Error ? err.message : String(err)
      );
      app.quit();
    }
  });
}

app.on("window-all-closed", () => {
  shutdownServer();
  app.quit();
});

app.on("before-quit", () => {
  shutdownServer();
});

function shutdownServer() {
  if (serverChild) {
    try {
      serverChild.kill();
    } catch {
      // ignore
    }
    serverChild = null;
  }
}
