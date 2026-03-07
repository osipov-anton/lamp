import { ipcMain, BrowserWindow } from 'electron'
import type { GoogleService } from '../google'

export function registerGoogleHandlers(service: GoogleService): void {
  service.onStatusChange((status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('google:status-changed', status)
    }
  })

  ipcMain.handle('google:start-auth', async () => {
    await service.startAuth()
  })

  ipcMain.handle('google:disconnect', async () => {
    await service.disconnect()
  })

  ipcMain.handle('google:status', () => {
    return service.status
  })

  ipcMain.handle('google:user-info', () => {
    return service.userInfo
  })
}
