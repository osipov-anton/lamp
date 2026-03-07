import { app, BrowserWindow, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { registerChatHandlers } from './ipc/chat'
import { registerSettingsHandlers } from './ipc/settings'
import { registerTelegramHandlers } from './ipc/telegram'
import { bootstrapAgentSystem } from './agent/bootstrap'
import { bridgeAgentEventsToIPC } from './ipc/agent'
import { getTelegramService } from './telegram'

function setupAutoUpdates(): void {
  if (!app.isPackaged) return

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] checking for updates')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] update available', info.version)
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] no updates available')
  })

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[updater] download progress: ${Math.round(progress.percent)}%`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] update downloaded', info.version)
    autoUpdater.quitAndInstall()
  })

  autoUpdater.on('error', (error) => {
    console.error('[updater] failed to check/download updates', error)
  })

  void autoUpdater.checkForUpdatesAndNotify()
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
    const { bus, router, openRouterProvider, memoryGraph, factExtraction, promptComposer } = bootstrapAgentSystem()

    bridgeAgentEventsToIPC(bus, {
      getRunContext: (runId) => router.getRunContextForRun(runId)
    })

    registerChatHandlers(router, openRouterProvider, memoryGraph, factExtraction, promptComposer)
    registerSettingsHandlers()

    const telegramService = getTelegramService()
    registerTelegramHandlers(telegramService)
    void telegramService.tryRestoreSession().then((restored) => {
      if (restored) console.log('[telegram] session restored successfully')
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
