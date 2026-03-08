import { ipcMain } from 'electron'
import {
  getAgentPresets,
  createAgentPreset,
  updateAgentPreset,
  deleteAgentPreset,
  getSettings
} from '../store'
import { withProxyRequestInit } from '../network/proxyDispatcher'

const IMPROVE_PROMPT_INSTRUCTION =
  'You are an expert prompt engineer. The user will give you a draft system prompt for an AI agent. ' +
  'Your task is to improve it: make it clearer, more specific, and more effective. ' +
  'Keep the same intent and language. Add structure if needed (role, constraints, output format). ' +
  'Return ONLY the improved prompt text, nothing else — no explanations, no markdown fences.'

export function registerAgentPresetHandlers(): void {
  ipcMain.handle('agent-preset:list', () => {
    return getAgentPresets()
  })

  ipcMain.handle(
    'agent-preset:create',
    (_event, data: { handle: string; name: string; prompt: string }) => {
      return createAgentPreset(data)
    }
  )

  ipcMain.handle(
    'agent-preset:update',
    (_event, id: string, data: { handle?: string; name?: string; prompt?: string }) => {
      return updateAgentPreset(id, data)
    }
  )

  ipcMain.handle('agent-preset:delete', (_event, id: string) => {
    deleteAgentPreset(id)
  })

  ipcMain.handle('agent-preset:improve-prompt', async (_event, draft: string) => {
    const settings = getSettings()
    if (!settings.openRouterApiKey) {
      throw new Error('OpenRouter API key is not set')
    }

    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      withProxyRequestInit(
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${settings.openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://lamp-desktop.app'
          },
          body: JSON.stringify({
            model: settings.model || 'openai/gpt-4o-mini',
            messages: [
              { role: 'system', content: IMPROVE_PROMPT_INSTRUCTION },
              { role: 'user', content: draft }
            ],
            temperature: 0.7
          })
        },
        settings.proxyUrl
      )
    )

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`OpenRouter request failed (${response.status}): ${text}`)
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const improved = json.choices?.[0]?.message?.content?.trim()
    if (!improved) {
      throw new Error('No response from model')
    }
    return improved
  })
}
