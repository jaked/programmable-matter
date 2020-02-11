// Modules to control application life and create native browser window
import { app, BrowserWindow, globalShortcut, Menu, MenuItemConstructorOptions } from 'electron';

import path from 'path';
import electronReload from 'electron-reload';
electronReload(path.resolve(__dirname, 'build'));

import { default as installExtension, REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: null | BrowserWindow;

function createWindow () {
  installExtension(REACT_DEVELOPER_TOOLS)
    .then((name) => console.log(`Added Extension:  ${name}`))
    .catch((err) => console.log('An error occurred: ', err));

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 800,
    webPreferences: {
      nodeIntegration: true
    }
  })

  // and load the index.html of the app.
  mainWindow.loadFile('index.html')

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
}

function send(msg: string, ...args) {
  mainWindow && mainWindow.webContents.send(msg, ...args);
}

function sendFunc(msg: string, ...args) {
  return () => send(msg, ...args);
}

function initGlobalShortcut() {
  const shortcut = globalShortcut.register('CommandOrControl+Alt+,', () => {
    if (mainWindow === null) {
      createWindow();
    } else if (!mainWindow.isFocused()) {
      app.focus();
      send('focus-search-box');
    } else {
      app.hide();
    }
  });
}

const productName = 'Programmable Matter';
const macos = true;
const isDevelopment = true;

function initMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: productName, // TODO(jaked) doesn't work
      submenu: [
        {
          label: `About ${productName}`,
          // click: () => new About ().init ()
        },
        {
          role: 'services',
          submenu: [] ,
          visible: macos
        },
        {
          type: 'separator',
          visible: macos
        },
        {
          role: 'hide',
          visible: macos
        },
        {
          role: 'hideothers',
          visible: macos
        },
        {
          role: 'unhide',
          visible: macos
        },
        {
          type: 'separator',
          visible: macos
        },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Search...',
          accelerator: 'CmdOrCtrl+L',
          click: sendFunc('focus-search-box'),
        },
        {
          type: 'separator'
        },
        {
          label: 'Delete Note',
          accelerator: 'CmdOrCtrl+Backspace',
          click: sendFunc('delete-note'),
        },
        {
          type: 'separator'
        },
        {
          label: 'Publish Site',
          click: sendFunc('publish-site'),
        },
        {
          label: 'Sync Google Tasks',
          click: sendFunc('sync-google-tasks'),
        },
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteandmatchstyle' },
        { role: 'delete' },
        { role: 'selectall' },
        {
          type: 'separator'
        },
      ]
    },
    {
      label: 'Go',
      submenu: [
        {
          // TODO(jaked) show current state of history in menu
          label: 'Back',
          accelerator: 'CmdOrCtrl+[',
          click: sendFunc('history-back'),
        },
        {
          // TODO(jaked) show current state of history in menu
          label: 'Forward',
          accelerator: 'CmdOrCtrl+]',
          click: sendFunc('history-forward'),
        },
        { type: 'separator'},
        {
          // TODO(jaked) show current state of history in menu
          label: 'Previous Problem',
          accelerator: 'Shift+F8',
          click: sendFunc('previous-problem'),
        },
        {
          // TODO(jaked) show current state of history in menu
          label: 'Next Problem',
          accelerator: 'F8',
          click: sendFunc('next-problem'),
        },
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          // TODO(jaked) show current state of side bar in menu
          label: 'Toggle Side Bar',
          accelerator: 'CmdOrCtrl+B',
          click: sendFunc('toggle-sidebar-visible'),
        },
        {
          // TODO(jaked) show current state of main pane in menu
          label: 'Code View',
          accelerator: 'CmdOrCtrl+Alt+C',
          click: sendFunc('set-main-pane-view', 'code'),
        },
        {
          // TODO(jaked) show current state of main pane in menu
          label: 'Display View',
          accelerator: 'CmdOrCtrl+Alt+D',
          click: sendFunc('set-main-pane-view', 'display'),
        },
        {
          // TODO(jaked) show current state of main pane in menu
          label: 'Split View',
          accelerator: 'CmdOrCtrl+Alt+S',
          click: sendFunc('set-main-pane-view', 'split'),
        },
        { type: 'separator'},
        // TODO(jaked) temporary, figure out better UI
        {
          // TODO(jaked) show current state of main pane in menu
          label: 'MDX View',
          accelerator: 'CmdOrCtrl+Alt+X',
          click: sendFunc('set-editor-view', 'mdx'),
        },
        {
          // TODO(jaked) show current state of main pane in menu
          label: 'JSON View',
          accelerator: 'CmdOrCtrl+Alt+J',
          click: sendFunc('set-editor-view', 'json'),
        },
        {
          // TODO(jaked) show current state of main pane in menu
          label: 'Meta View',
          accelerator: 'CmdOrCtrl+Alt+M',
          click: sendFunc('set-editor-view', 'meta'),
        },
        { type: 'separator'},
        {
          role: 'reload',
          visible: isDevelopment
        },
        {
          role: 'forcereload',
          visible: isDevelopment
        },
        {
          type: 'separator',
          visible: isDevelopment
        },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          role: 'togglefullscreen'
        },
      ]
    },
    {
      role: 'window',
      submenu: [
        { role: 'close' },
        { role: 'minimize' },
        {
          role: 'zoom',
          visible: macos
        },
        {
          type: 'separator'
        },
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          role: 'toggledevtools',
          accelerator: 'CommandOrControl+Alt+I'
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate ( template );

  Menu.setApplicationMenu ( menu );
}

function initEventHandlers() {
  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.on('ready', () => {
    // Electron crashes if we call this before the ready event
    initGlobalShortcut();

    createWindow();
  });

  // Quit when all windows are closed.
  app.on('window-all-closed', function () {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) createWindow()
  })
}

function init() {
  initEventHandlers();
  initMenu();
}

init();
