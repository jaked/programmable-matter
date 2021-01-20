import * as Path from 'path';
import { app, dialog, BrowserWindow, globalShortcut, Menu, MenuItemConstructorOptions } from 'electron';
import * as Atomically from 'atomically';

type Config = {
  dataDir: string;
}

function getConfigPath() {
  const userDataPath = app.getPath('userData');
  const configPath = Path.resolve(userDataPath, 'config.json');
  return configPath;
}

async function readConfig(): Promise<Config> {
  const configPath = getConfigPath();
  const configData = await Atomically.readFile(configPath, { encoding: 'utf8' });
  return JSON.parse(configData) as Config;
}

async function safeReadConfig(): Promise<Config> {
  return readConfig().catch(e => {
    const documentsPath = app.getPath('documents');
    const dataDir = Path.resolve(documentsPath, 'Programmable Matter');
    const config: Config = { dataDir };
    writeConfig(config);
    return config;
  });
}

function writeConfig(config: Config): Promise<void> {
  const configPath = getConfigPath();
  const configData = JSON.stringify(config, undefined, 2);
  return Atomically.writeFile(configPath, configData, { encoding: 'utf8' });
}

async function setDataDir(): Promise<void> {
  const config = await safeReadConfig();
  const chosen = await dialog.showOpenDialog({
      defaultPath: config.dataDir,
      properties: ['openDirectory', 'createDirectory'],
      message: 'Choose data directory',
    });
  if (chosen.canceled) {
    return;
  } else {
    const dataDir = chosen.filePaths[0];
    await writeConfig({ dataDir });
    send('set-data-dir', dataDir);
  }
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: null | BrowserWindow;

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 800,
    webPreferences: {
      // TODO(jaked)
      // need to remove this for security
      nodeIntegration: true,
    }
  })

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // TODO(jaked) maybe there is a more direct way to do this?
  mainWindow.on('focus', () => mainWindow?.webContents.send('focus'));
  mainWindow.on('blur', () => mainWindow?.webContents.send('blur'));

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })

  return mainWindow.loadFile('index.html');
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
      app.focus({ steal: true });
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
          type: 'separator',
          visible: macos
        },
        {
          label: 'Set data directory',
          click: setDataDir
        },
        {
          type: 'separator',
          visible: macos
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
          role: 'hideOthers',
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
        {
          label: 'Generate .pm files from .mdx files',
          click: sendFunc('generate-pm-from-mdx'),
        }
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
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
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
          accelerator: 'CmdOrCtrl+Alt+B',
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
          label: 'Table View',
          accelerator: 'CmdOrCtrl+Alt+T',
          click: sendFunc('set-editor-view', 'table'),
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
          role: 'forceReload',
          visible: isDevelopment
        },
        {
          type: 'separator',
          visible: isDevelopment
        },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
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
          role: 'toggleDevTools',
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
  app.on('ready', async () => {
    // Electron crashes if we call this before the ready event
    initGlobalShortcut();

    await createWindow();

    const config = await safeReadConfig();
    send('set-data-dir', config.dataDir);
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
