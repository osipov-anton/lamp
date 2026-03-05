import { ipcMain } from 'electron'
import { getSettings, saveSettings } from '../store'
import { withProxyRequestInit } from '../network/proxyDispatcher'

interface AppSettings {
  openRouterApiKey: string
  model: string
  proxyUrl: string
  telegramSession?: string
}

export interface OpenRouterModel {
  id: string
  name: string
}

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const settings = getSettings()
  const res = await fetch(
    'https://openrouter.ai/api/v1/models',
    withProxyRequestInit({}, settings.proxyUrl)
  )
  if (!res.ok) throw new Error('Failed to fetch models')
  const json = (await res.json()) as { data: Array<{ id: string; name: string }> }
  return json.data.map((m) => ({ id: m.id, name: m.name }))
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => {
    return getSettings()
  })

  ipcMain.handle('settings:save', (_event, settings: AppSettings) => {
    saveSettings(settings)
  })

  ipcMain.handle('settings:fetch-models', () => {
    return fetchOpenRouterModels()
  })
}
