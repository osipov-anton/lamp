import { ipcMain, BrowserWindow, dialog, nativeImage } from 'electron'
import { basename, extname } from 'path'
import { readFile, stat } from 'fs/promises'
import {
  createChat,
  createThread,
  deleteChat,
  deleteThread,
  getChat,
  getChats,
  getThread,
  getThreadHistory,
  addMessage,
  updateMessage,
  updateChatTitle,
  getSettings,
  getAgentPresetByHandle,
  type ChatAttachment
} from '../store'
import type { SupervisorRouter } from '../agent/orchestrator/SupervisorRouter'
import type { OpenRouterProviderAdapter } from '../agent/providers/openrouter/OpenRouterProviderAdapter'
import type { NormalizedMessage } from '../agent/runtime/types'
import type { MemoryGraphPort } from '../storage/ports/MemoryGraphPort'
import type { ToolCallCollector } from './agent'

import { ChatIdleAnalyzer } from '../agent/memory/ChatIdleAnalyzer'
import { getTelegramService } from '../telegram'
import { withProxyRequestInit } from '../network/proxyDispatcher'

const MAX_TEXT_ATTACHMENT_BYTES = 200_000
const TEXT_FILE_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.json',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.html',
  '.css',
  '.scss',
  '.yml',
  '.yaml',
  '.xml',
  '.csv',
  '.log',
  '.py',
  '.java',
  '.go',
  '.rs',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.sql'
])

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.heic': 'image/heic',
  '.heif': 'image/heif'
}

interface CachedModelCapabilities {
  fetchedAt: number
  byModelId: Map<string, string[]>
}

interface ChatAttachmentInput {
  id: string
  name: string
  filePath: string
  mimeType: string
  size: number
  isImage: boolean
  previewDataUrl?: string
}

let cachedModelCapabilities: CachedModelCapabilities | null = null

export function registerChatHandlers(
  router: SupervisorRouter,
  openRouterProvider: OpenRouterProviderAdapter,
  memoryGraph: MemoryGraphPort,
  toolCallCollector: ToolCallCollector
): void {
  const idleAnalyzer = new ChatIdleAnalyzer(router, (chatId, threadId) =>
    getThreadHistory(chatId, threadId).map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system' | 'tool',
      content: m.content,
      timestamp: m.timestamp
    }))
  )
  ipcMain.handle('chat:list', () => {
    return getChats()
  })

  ipcMain.handle('chat:get', (_event, id: string) => {
    return getChat(id)
  })

  ipcMain.handle('chat:create', () => {
    return createChat()
  })

  ipcMain.handle('chat:delete', (_event, id: string) => {
    deleteChat(id)
    void memoryGraph.rebuildMessages(
      getChats().flatMap((chat) =>
        chat.threads.flatMap((thread) =>
          thread.messages.map((message) => ({
            chatId: chat.id,
            threadId: thread.id,
            chatTitle: chat.title,
            messageId: message.id,
            role: message.role,
            content: message.content,
            senderName: message.role === 'assistant' ? 'assistant' : 'user',
            channelType: 'local_chat',
            channelExternalId: '',
            timestamp: message.timestamp
          }))
        )
      )
    ).catch((error) => {
      console.error('[memory] failed to rebuild message index after chat deletion:', error)
    })
  })

  ipcMain.handle('chat:delete-thread', (_event, chatId: string, threadId: string) => {
    deleteThread(chatId, threadId)
  })

  ipcMain.handle(
    'chat:create-thread',
    (_event, payload: { chatId: string; sourceThreadId: string; messageId: string; anchorQuote?: string }) => {
      const thread = createThread({
        chatId: payload.chatId,
        sourceThreadId: payload.sourceThreadId,
        forkFromMessageId: payload.messageId,
        anchorQuote: payload.anchorQuote
      })
      return thread
    }
  )

  ipcMain.handle('chat:pick-attachments', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return []

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return []
    }

    const attachments: ChatAttachment[] = []
    for (const filePath of result.filePaths) {
      try {
        const fileStats = await stat(filePath)
        if (!fileStats.isFile()) continue
        attachments.push(await toChatAttachment(filePath, fileStats.size))
      } catch {
        // Skip unreadable files
      }
    }

    return attachments
  })

  ipcMain.handle(
    'chat:send-message',
    async (
      event,
      chatId: string,
      threadId: string,
      content: string,
      attachments?: ChatAttachmentInput[]
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return

      const settings = getSettings()
      if (!settings.openRouterApiKey) {
        win.webContents.send('chat:stream-error', {
          chatId,
          threadId,
          error: 'OpenRouter API key is not set. Go to Settings to add it.'
        })
        return
      }

      openRouterProvider.updateApiKey(settings.openRouterApiKey)
      openRouterProvider.updateProxyUrl(settings.proxyUrl)

      let agentInstruction: string | undefined
      const handleMatch = content.match(/^@(\w+)\s/)
      if (handleMatch) {
        const preset = getAgentPresetByHandle(handleMatch[1])
        if (preset) {
          agentInstruction = preset.prompt
        }
      }

      const mainAgent = router.getAgent('main')
      if (mainAgent && mainAgent.modelConfig.model !== settings.model) {
        mainAgent.modelConfig.model = settings.model
      }

      const memoryCurator = router.getAgent('memory_curator')
      const memoryModel =
        settings.memoryModel || settings.model || 'anthropic/claude-sonnet-4.6'
      if (memoryCurator && memoryCurator.modelConfig.model !== memoryModel) {
        memoryCurator.modelConfig.model = memoryModel
      }

      if (mainAgent) {
        mainAgent.systemPrompt = buildSystemPrompt(agentInstruction)
      }

      const safeAttachments = sanitizeIncomingAttachments(attachments)
      const hasImageAttachments = safeAttachments.some((attachment) => attachment.isImage)
      if (hasImageAttachments) {
        let supportsImages = false
        try {
          supportsImages = await modelSupportsInputModality(settings.model, 'image')
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Failed to verify model capabilities'
          win.webContents.send('chat:stream-error', {
            chatId,
            threadId,
            error: message
          })
          return
        }

        if (!supportsImages) {
          win.webContents.send('chat:stream-error', {
            chatId,
            threadId,
            error:
              `Selected model "${settings.model}" does not support image input on OpenRouter. ` +
              'Choose a vision-capable model (input_modalities includes "image").'
          })
          return
        }
      }

      const userMessage = {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content,
        timestamp: Date.now(),
        attachments: safeAttachments.length > 0 ? safeAttachments : undefined
      }
      addMessage(chatId, userMessage, threadId)
      const chatAfterUserMessage = getChat(chatId)
      if (chatAfterUserMessage) {
        void indexMessage(
          memoryGraph,
          {
            chatId,
            threadId,
            chatTitle: chatAfterUserMessage.title,
            messageId: userMessage.id,
            role: userMessage.role,
            content: userMessage.content,
            senderName: 'user',
            channelType: 'local_chat',
            channelExternalId: '',
            timestamp: userMessage.timestamp
          }
        ).catch((error) => {
          console.error('[memory] failed to index user message:', error)
        })
      }

      idleAnalyzer.schedule(chatId, threadId)

      const chat = getChat(chatId)
      if (!chat) return
      const thread = getThread(chatId, threadId) ?? getThread(chatId, chat.mainThreadId)
      if (!thread) return

      const assistantMessageId = crypto.randomUUID()
      addMessage(chatId, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now()
      }, thread.id)

      const fullHistory = getThreadHistory(chatId, thread.id)
      const threadContextMessages: NormalizedMessage[] = []
      for (const m of fullHistory) {
        if (m.id === assistantMessageId) continue

        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
          threadContextMessages.push({
            role: 'assistant',
            content: null,
            toolCalls: m.toolCalls.map((tc) => ({
              callId: tc.callId,
              toolName: tc.toolName,
              arguments: tc.arguments
            }))
          })
          for (const tc of m.toolCalls) {
            threadContextMessages.push({
              role: 'tool',
              toolCallId: tc.callId,
              content: tc.result?.success
                ? (tc.result.content ?? '')
                : `Error: ${tc.result?.error ?? 'unknown error'}`
            })
          }
          if (m.content) {
            threadContextMessages.push({ role: 'assistant', content: m.content })
          }
          continue
        }

        const normalized: NormalizedMessage = {
          role: m.role as NormalizedMessage['role'],
          content: m.content
        }
        if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
          normalized.attachments = await normalizeAttachmentsForModel(m.attachments)
        }
        threadContextMessages.push(normalized)
      }
      const messages: NormalizedMessage[] =
        thread.anchorQuote && thread.anchorQuote.trim().length > 0
          ? [
              {
                role: 'system',
                content: `Thread focus quote:\n${thread.anchorQuote.trim()}`
              },
              ...threadContextMessages
            ]
          : threadContextMessages

      console.log('[agent] starting run for chat', chatId, 'messages:', messages.length)
      runAgent(
        router,
        chatId,
        thread.id,
        assistantMessageId,
        messages,
        fullHistory.length,
        win,
        memoryGraph,
        idleAnalyzer,
        toolCallCollector
      )
    }
  )

  ipcMain.handle('chat:stop-stream', (_event, chatId: string, threadId?: string) => {
    if (!chatId) return { cancelledRuns: 0 }
    const cancelledRuns = router.cancelRunsForChat(chatId, threadId)
    return { cancelledRuns }
  })
}

function runAgent(
  router: SupervisorRouter,
  chatId: string,
  threadId: string,
  assistantMessageId: string,
  messages: NormalizedMessage[],
  messageCount: number,
  win: BrowserWindow,
  memoryGraph: MemoryGraphPort,
  idleAnalyzer: ChatIdleAnalyzer,
  toolCallCollector: ToolCallCollector
): void {
  router
    .executeRun('main', chatId, threadId, messages)
    .then((finalText) => {
      console.log('[agent] run completed, finalText length:', finalText.length)
      const storedToolCalls = toolCallCollector.drain(chatId, threadId)
      updateMessage(chatId, assistantMessageId, finalText, threadId, storedToolCalls)
      let effectiveTitle: string | undefined
      if (messageCount <= 2) {
        effectiveTitle = finalText.slice(0, 50).split('\n')[0] || 'New Chat'
        updateChatTitle(chatId, effectiveTitle)
      }

      const chat = getChat(chatId)
      const thread = chat ? getThread(chat.id, threadId) : null
      const assistantMessage = thread?.messages.find((message) => message.id === assistantMessageId)
      if (chat && assistantMessage) {
        void indexMessage(
          memoryGraph,
          {
            chatId,
            threadId,
            chatTitle: effectiveTitle ?? chat.title,
            messageId: assistantMessage.id,
            role: assistantMessage.role,
            content: finalText,
            senderName: 'assistant',
            channelType: 'local_chat',
            channelExternalId: '',
            timestamp: assistantMessage.timestamp
          }
        ).catch((error) => {
          console.error('[memory] failed to index assistant message:', error)
        })
      }

      idleAnalyzer.schedule(chatId, threadId)

      win.webContents.send('chat:stream-end', {
        chatId,
        threadId,
        messageId: assistantMessageId
      })
    })
    .catch((err) => {
      console.error('[agent] run failed:', err)
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      win.webContents.send('chat:stream-error', { chatId, threadId, error: errorMsg })
    })
}

function sanitizeIncomingAttachments(attachments: ChatAttachmentInput[] | undefined): ChatAttachment[] {
  if (!attachments || attachments.length === 0) return []
  return attachments
    .filter((attachment) => typeof attachment.filePath === 'string' && attachment.filePath.trim().length > 0)
    .map((attachment) => ({
      id: attachment.id || crypto.randomUUID(),
      name: attachment.name || basename(attachment.filePath),
      filePath: attachment.filePath,
      mimeType: attachment.mimeType || detectMimeType(attachment.filePath),
      size: Number.isFinite(attachment.size) ? attachment.size : 0,
      isImage: isImageAttachment(attachment.filePath, attachment.mimeType, attachment.isImage),
      previewDataUrl: sanitizePreviewDataUrl(attachment.previewDataUrl)
    }))
}

async function toChatAttachment(filePath: string, size: number): Promise<ChatAttachment> {
  const mimeType = detectMimeType(filePath)
  const isImage = isImageAttachment(filePath, mimeType, false)
  let previewDataUrl: string | undefined
  if (isImage) {
    previewDataUrl = await createImagePreviewDataUrl(filePath, mimeType)
  }
  return {
    id: crypto.randomUUID(),
    name: basename(filePath),
    filePath,
    mimeType,
    size,
    isImage,
    previewDataUrl
  }
}

function detectMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  if (IMAGE_MIME_BY_EXT[ext]) return IMAGE_MIME_BY_EXT[ext]
  if (ext === '.pdf') return 'application/pdf'
  if (TEXT_FILE_EXTENSIONS.has(ext)) return 'text/plain'
  return 'application/octet-stream'
}

async function normalizeAttachmentsForModel(
  attachments: ChatAttachment[]
): Promise<NonNullable<NormalizedMessage['attachments']>> {
  const normalized: NonNullable<NormalizedMessage['attachments']> = []

  for (const attachment of attachments) {
    if (attachment.isImage) {
      try {
        const buffer = await readFile(attachment.filePath)
        normalized.push({
          type: 'image',
          name: attachment.name,
          mimeType: attachment.mimeType,
          dataUrl: `data:${attachment.mimeType};base64,${buffer.toString('base64')}`
        })
      } catch {
        // Skip images that cannot be read.
      }
      continue
    }

    if (attachment.mimeType === 'application/pdf') {
      try {
        const buffer = await readFile(attachment.filePath)
        normalized.push({
          type: 'pdf',
          name: attachment.name,
          mimeType: attachment.mimeType,
          dataUrl: `data:application/pdf;base64,${buffer.toString('base64')}`
        })
      } catch {
        // Skip PDFs that cannot be read.
      }
      continue
    }

    try {
      const buffer = await readFile(attachment.filePath)
      const slice = buffer.subarray(0, MAX_TEXT_ATTACHMENT_BYTES)
      const textContent = slice.toString('utf8')
      if (!textContent || textContent.includes('\u0000')) continue
      normalized.push({
        type: 'file',
        name: attachment.name,
        mimeType: attachment.mimeType,
        textContent
      })
    } catch {
      // Skip unreadable files.
    }
  }

  return normalized
}

function sanitizePreviewDataUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (!value.startsWith('data:image/')) return undefined
  if (!value.includes(';base64,')) return undefined
  return value
}

async function createImagePreviewDataUrl(
  filePath: string,
  mimeType: string
): Promise<string | undefined> {
  try {
    const buffer = await readFile(filePath)
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  } catch {
    // Fallback via nativeImage for image formats that may fail direct reads.
    const image = nativeImage.createFromPath(filePath)
    const dataUrl = image.isEmpty() ? '' : image.toDataURL()
    return dataUrl || undefined
  }
}

function isImageAttachment(filePath: string, mimeType: string | undefined, isImageHint: boolean): boolean {
  if (isImageHint) return true
  if (mimeType?.startsWith('image/')) return true
  const ext = extname(filePath).toLowerCase()
  return Object.prototype.hasOwnProperty.call(IMAGE_MIME_BY_EXT, ext)
}

async function indexMessage(
  memoryGraph: MemoryGraphPort,
  message: {
    chatId: string
    threadId: string
    chatTitle: string
    messageId: string
    role: 'user' | 'assistant' | 'system'
    content: string
    senderName: string
    channelType: 'telegram' | 'local_chat' | 'email' | 'whatsapp'
    channelExternalId: string
    timestamp: number
  }
): Promise<void> {
  await memoryGraph.upsertMessage(message)
}

async function modelSupportsInputModality(modelId: string, modality: string): Promise<boolean> {
  const byModelId = await getModelCapabilitiesMap()
  const modalities = byModelId.get(modelId)
  if (!modalities) return false
  return modalities.includes(modality)
}

const BASE_SYSTEM_PROMPT =
  'You are Lamp, a helpful AI assistant. Be concise and accurate.\n\n' +
  'MEMORY: At the start of every conversation turn, ALWAYS call memory_query with a relevant search query to recall facts, preferences, and context about the user and topic. ' +
  'Use the retrieved memories to personalize your response. Do not skip this step.\n\n' +
  'TOOLS:\n' +
  '- memory_query: search stored facts and knowledge about the user (ALWAYS use proactively)\n' +
  '- web_search: look up real-time information from the internet\n' +
  '- search_messages: search raw chat history for past conversations'

const TELEGRAM_SYSTEM_PROMPT_ADDON =
  '\n\nYou have access to Telegram tools. You can list the user\'s chats, read messages, send messages, and search messages. ' +
  'Use these tools when the user asks about their Telegram messages or wants to communicate through Telegram. ' +
  'IMPORTANT: Always confirm with the user before sending messages on their behalf.'

function buildSystemPrompt(agentInstruction?: string): string {
  const telegram = getTelegramService()
  const currentDate = `Current date: ${new Date().toISOString()}`
  const telegramAddon = telegram.isConnected() ? TELEGRAM_SYSTEM_PROMPT_ADDON : ''
  const parts = [BASE_SYSTEM_PROMPT, currentDate, telegramAddon]
  if (agentInstruction) {
    parts.unshift(agentInstruction)
  }
  return parts.filter(Boolean).join('\n\n')
}

async function getModelCapabilitiesMap(): Promise<Map<string, string[]>> {
  const now = Date.now()
  if (cachedModelCapabilities && now - cachedModelCapabilities.fetchedAt < 5 * 60_000) {
    return cachedModelCapabilities.byModelId
  }

  const settings = getSettings()
  const response = await fetch(
    'https://openrouter.ai/api/v1/models',
    withProxyRequestInit({}, settings.proxyUrl)
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenRouter models (${response.status})`)
  }

  const payload = (await response.json()) as {
    data?: Array<{ id?: string; architecture?: { input_modalities?: string[] } }>
  }

  const map = new Map<string, string[]>()
  for (const model of payload.data ?? []) {
    if (!model.id) continue
    map.set(model.id, model.architecture?.input_modalities ?? [])
  }

  cachedModelCapabilities = {
    fetchedAt: now,
    byModelId: map
  }

  return map
}
