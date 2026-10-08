'use strict';

const { BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

function createMainWindow({ page, iconPath, onClose }) {
  const win = new BrowserWindow({
    width: 1000,
    height: 920,
    minWidth: 700,
    minHeight: 640,
    backgroundColor: '#121218',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    title: 'Hermes Launcher'
  });

  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.loadURL(page);

  if (typeof onClose === 'function') {
    win.on('close', onClose);
  }

  return win;
}

function createTray({ iconPath, onOpen, onStartAll, onStopAll, onQuit }) {
  const trayIcon = nativeImage.createFromPath(iconPath);
  const tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));

  tray.setToolTip('Hermes Launcher');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть Hermes', click: onOpen },
    { label: 'Запустить всё', click: onStartAll },
    { label: 'Остановить всё', click: onStopAll },
    { type: 'separator' },
    { label: 'Выход', click: onQuit }
  ]));

  return tray;
}

module.exports = { createMainWindow, createTray };
