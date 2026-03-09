import * as Sentry from '@sentry/electron/main'
import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'

Sentry.init({
  dsn: 'https://5465066c9df057d27782bdb64b3464e0@logs.osipov.digital/34'
})
import icon from '../../resources/icon.png?asset'
import { registerChatHandlers } from './ipc/chat'
import { registerSettingsHandlers } from './ipc/settings'
import { registerTelegramHandlers } from './ipc/telegram'
import { registerGoogleHandlers } from './ipc/google'
import { registerMemoryHandlers } from './ipc/memory'
import { registerAgentPresetHandlers } from './ipc/agentPresets'
import { registerIntegrationHandlers, loadApprovedIntegrations } from './ipc/integrations'
import { bootstrapAgentSystem } from './agent/bootstrap'
import { bridgeAgentEventsToIPC, ToolCallCollector } from './ipc/agent'
import { getTelegramService } from './telegram'
import { getGoogleService } from './google'

function setupAutoUpdates(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] update downloaded', info.version)

    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    dialog.showMessageBox(window ?? {}, {
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is ready to install.`,
      detail: 'The update will be applied after restart.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall()
      }
    })
  })

  autoUpdater.on('error', (error) => {
    console.error('[updater] failed to check/download updates', error)
  })

  void autoUpdater.checkForUpdatesAndNotify()

  setupAppMenu()
}

function checkForUpdatesManually(): void {
  autoUpdater.once('update-not-available', () => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    dialog.showMessageBox(window ?? {}, {
      type: 'info',
      title: 'No Updates',
      message: 'You are using the latest version.',
      buttons: ['OK']
    })
  })
  void autoUpdater.checkForUpdates()
}

function setupAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Check for Updates…',
          click: () => checkForUpdatesManually()
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 500,
    show: false,
    icon,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.setIcon(icon)
  }

  try {
    const { bus, router, openRouterProvider, memoryGraph, catalog, integrationService } = bootstrapAgentSystem()

    const toolCallCollector = new ToolCallCollector()

    bridgeAgentEventsToIPC(bus, {
      getRunContext: (runId) => router.getRunContextForRun(runId)
    }, toolCallCollector)

    registerChatHandlers(router, openRouterProvider, memoryGraph, toolCallCollector)
    registerSettingsHandlers()
    registerMemoryHandlers(memoryGraph)
    registerAgentPresetHandlers()
    registerIntegrationHandlers(integrationService, catalog, router)
    loadApprovedIntegrations(integrationService, catalog, router)

    const telegramService = getTelegramService()
    registerTelegramHandlers(telegramService)
    void telegramService.tryRestoreSession().then((restored) => {
      if (restored) console.log('[telegram] session restored successfully')
    })

    const googleService = getGoogleService()
    registerGoogleHandlers(googleService)
    void googleService.tryRestoreSession().then((restored) => {
      if (restored) console.log('[google] session restored successfully')
    })
  } catch (err) {
    console.error('[app] bootstrap failed, opening window anyway:', err)
  }

  createWindow()
  setupAutoUpdates()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
