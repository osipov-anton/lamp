import { ipcMain, BrowserWindow } from 'electron'
import type { TelegramService } from '../telegram'

export function registerTelegramHandlers(service: TelegramService): void {
  service.onStatusChange((status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('telegram:status-changed', status)
    }
  })

  ipcMain.handle('telegram:send-code', async (_event, phone: string) => {
    if (!service.isConnected()) {
      await service.connect()
    }
    await service.sendCode(phone)
  })

  ipcMain.handle('telegram:sign-in', async (_event, code: string) => {
    return service.signIn(code)
  })

  ipcMain.handle('telegram:submit-2fa', async (_event, password: string) => {
    await service.submit2FA(password)
  })

  ipcMain.handle('telegram:disconnect', async () => {
    await service.disconnect()
  })

  ipcMain.handle('telegram:status', () => {
    return service.status
  })
}
