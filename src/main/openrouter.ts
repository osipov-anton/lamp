import { BrowserWindow } from 'electron'
import { getSettings, addMessage, updateMessage, updateChatTitle, getChat } from './store'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export async function streamChatCompletion(
  chatId: string,
  userContent: string,
  win: BrowserWindow
): Promise<void> {
  const settings = getSettings()

  if (!settings.openRouterApiKey) {
    win.webContents.send('chat:stream-error', {
      chatId,
      error: 'OpenRouter API key is not set. Go to Settings to add it.'
    })
    return
  }

  const userMessage = {
    id: crypto.randomUUID(),
    role: 'user' as const,
    content: userContent,
    timestamp: Date.now()
  }
  addMessage(chatId, userMessage)

  const chat = getChat(chatId)
  if (!chat) return
  const mainThread = chat.threads.find((thread) => thread.id === chat.mainThreadId)
  if (!mainThread) return

  const messages: ChatMessage[] = mainThread.messages.map((m) => ({
    role: m.role,
    content: m.content
  }))

  const assistantMessageId = crypto.randomUUID()
  addMessage(chatId, {
    id: assistantMessageId,
    role: 'assistant',
    content: '',
    timestamp: Date.now()
  })

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://lamp-desktop.app',
        'X-Title': 'Lamp Desktop'
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        stream: true
      })
    })

    if (!response.ok) {
      const errorBody = await response.text()
      let errorMsg = `API error ${response.status}`
      try {
        const parsed = JSON.parse(errorBody)
        errorMsg = parsed.error?.message || errorMsg
      } catch {
        // use default error message
      }
      win.webContents.send('chat:stream-error', { chatId, error: errorMsg })
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      win.webContents.send('chat:stream-error', { chatId, error: 'No response body' })
      return
    }

    const decoder = new TextDecoder()
    let fullContent = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            fullContent += delta
            win.webContents.send('chat:stream-chunk', { chatId, chunk: delta })
          }
        } catch {
          // skip malformed JSON lines
        }
      }
    }

    updateMessage(chatId, assistantMessageId, fullContent)

    if (mainThread.messages.length <= 2) {
      const title = fullContent.slice(0, 50).split('\n')[0] || 'New Chat'
      updateChatTitle(chatId, title)
    }

    win.webContents.send('chat:stream-end', { chatId, messageId: assistantMessageId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    win.webContents.send('chat:stream-error', { chatId, error: errorMsg })
  }
}
