import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'

export interface Chat {
  id: string
  title: string
  mainThreadId: string
  threads: ChatThread[]
  createdAt: number
  updatedAt: number
}

export interface ChatThread {
  id: string
  chatId: string
  parentThreadId: string | null
  forkFromMessageId: string | null
  title: string
  anchorQuote?: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface StoredToolCall {
  callId: string
  toolName: string
  arguments: string
  status: 'completed' | 'failed' | 'cancelled'
  statusText?: string
  elapsedMs: number
  result?: {
    success: boolean
    content?: string
    error?: string
  }
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  attachments?: ChatAttachment[]
  toolCalls?: StoredToolCall[]
}

export interface ChatAttachment {
  id: string
  name: string
  filePath: string
  mimeType: string
  size: number
  isImage: boolean
  previewDataUrl?: string
}

interface AppSettings {
  openRouterApiKey: string
  model: string
  memoryModel: string
  proxyUrl: string
  telegramSession?: string
  googleRefreshToken?: string
  googleAccessToken?: string
  googleTokenExpiry?: number
}

export interface AgentPreset {
  id: string
  handle: string
  name: string
  prompt: string
  createdAt: number
  updatedAt: number
}

interface StoreData {
  chats: Chat[]
  settings: AppSettings
  agentPresets: AgentPreset[]
}

const DEFAULT_DATA: StoreData = {
  chats: [],
  settings: {
    openRouterApiKey: '',
    model: 'openai/gpt-5.4',
    memoryModel: 'anthropic/claude-sonnet-4.6',
    proxyUrl: ''
  },
  agentPresets: []
}

function getStorePath(): string {
  const dir = join(app.getPath('userData'), 'lamp-data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'store.json')
}

function readStore(): StoreData {
  const path = getStorePath()
  if (!existsSync(path)) return { ...DEFAULT_DATA }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as StoreData
    const { data, changed } = normalizeStoreData(parsed)
    if (changed) {
      writeStore(data)
    }
    return data
  } catch {
    return { ...DEFAULT_DATA }
  }
}

function writeStore(data: StoreData): void {
  writeFileSync(getStorePath(), JSON.stringify(data, null, 2), 'utf-8')
}

export function getChats(): Chat[] {
  return readStore().chats
}

export function getChat(id: string): Chat | null {
  return readStore().chats.find((c) => c.id === id) ?? null
}

export function createChat(): Chat {
  const data = readStore()
  const now = Date.now()
  const mainThreadId = crypto.randomUUID()
  const chat: Chat = {
    id: crypto.randomUUID(),
    title: 'New Chat',
    mainThreadId,
    threads: [
      {
        id: mainThreadId,
        chatId: '',
        parentThreadId: null,
        forkFromMessageId: null,
        title: 'Main',
        messages: [],
        createdAt: now,
        updatedAt: now
      }
    ],
    createdAt: now,
    updatedAt: now
  }
  chat.threads[0].chatId = chat.id
  data.chats.unshift(chat)
  writeStore(data)
  return chat
}

export function deleteChat(id: string): void {
  const data = readStore()
  data.chats = data.chats.filter((c) => c.id !== id)
  writeStore(data)
}

export function addMessage(chatId: string, message: ChatMessage, threadId?: string): void {
  const data = readStore()
  const chat = data.chats.find((c) => c.id === chatId)
  if (!chat) return
  const thread = findThread(chat, threadId ?? chat.mainThreadId)
  if (!thread) return
  thread.messages.push(message)
  thread.updatedAt = Date.now()
  chat.updatedAt = Date.now()
  writeStore(data)
}

export function updateMessage(
  chatId: string,
  messageId: string,
  content: string,
  threadId?: string,
  toolCalls?: StoredToolCall[]
): void {
  const data = readStore()
  const chat = data.chats.find((c) => c.id === chatId)
  if (!chat) return
  const targetThread = threadId ? findThread(chat, threadId) : findThreadContainingMessage(chat, messageId)
  if (!targetThread) return
  const msg = targetThread.messages.find((m) => m.id === messageId)
  if (!msg) return
  msg.content = content
  if (toolCalls && toolCalls.length > 0) {
    msg.toolCalls = toolCalls
  }
  targetThread.updatedAt = Date.now()
  chat.updatedAt = Date.now()
  writeStore(data)
}

export function updateChatTitle(chatId: string, title: string): void {
  const data = readStore()
  const chat = data.chats.find((c) => c.id === chatId)
  if (!chat) return
  chat.title = title
  chat.updatedAt = Date.now()
  writeStore(data)
}

export function getThread(chatId: string, threadId: string): ChatThread | null {
  const chat = getChat(chatId)
  if (!chat) return null
  return findThread(chat, threadId) ?? null
}

export function createThread(input: {
  chatId: string
  sourceThreadId: string
  forkFromMessageId: string
  parentThreadId?: string | null
  anchorQuote?: string
  title?: string
}): ChatThread | null {
  const data = readStore()
  const chat = data.chats.find((c) => c.id === input.chatId)
  if (!chat) return null

  const sourceThread = findThread(chat, input.sourceThreadId)
  if (!sourceThread) return null

  const forkIndex = sourceThread.messages.findIndex((message) => message.id === input.forkFromMessageId)
  if (forkIndex < 0) return null

  const now = Date.now()
  const newThread: ChatThread = {
    id: crypto.randomUUID(),
    chatId: chat.id,
    parentThreadId: input.parentThreadId ?? input.sourceThreadId,
    forkFromMessageId: input.forkFromMessageId,
    title: input.title?.trim() || `Thread ${chat.threads.length + 1}`,
    anchorQuote: input.anchorQuote?.trim() || undefined,
    messages: [],
    createdAt: now,
    updatedAt: now
  }

  chat.threads.push(newThread)
  chat.updatedAt = now
  writeStore(data)
  return newThread
}

export function deleteThread(chatId: string, threadId: string): void {
  const data = readStore()
  const chat = data.chats.find((c) => c.id === chatId)
  if (!chat) return
  if (chat.mainThreadId === threadId) return
  
  const initialLength = chat.threads.length
  chat.threads = chat.threads.filter((t) => t.id !== threadId)
  
  if (chat.threads.length !== initialLength) {
    chat.updatedAt = Date.now()
    writeStore(data)
  }
}

export function getThreadHistory(chatId: string, threadId: string): ChatMessage[] {
  const chat = getChat(chatId)
  if (!chat) return []
  
  const thread = chat.threads.find(t => t.id === threadId)
  if (!thread) return []

  if (!thread.parentThreadId) {
    return thread.messages
  }

  const history: ChatMessage[] = []
  let currentThread: ChatThread | undefined = thread
  const threadsToProcess: ChatThread[] = []
  
  while (currentThread) {
    threadsToProcess.unshift(currentThread)
    if (currentThread.parentThreadId) {
      currentThread = chat.threads.find(t => t.id === currentThread!.parentThreadId)
    } else {
      currentThread = undefined
    }
  }

  for (let i = 0; i < threadsToProcess.length; i++) {
    const t = threadsToProcess[i]
    if (i === threadsToProcess.length - 1) {
      history.push(...t.messages)
    } else {
      const nextThread = threadsToProcess[i + 1]
      const forkIndex = t.messages.findIndex(m => m.id === nextThread.forkFromMessageId)
      if (forkIndex >= 0) {
        history.push(...t.messages.slice(0, forkIndex + 1))
      } else {
        history.push(...t.messages)
      }
    }
  }
  
  return history
}

export function getSettings(): AppSettings {
  return readStore().settings
}

export function saveSettings(settings: Partial<AppSettings>): void {
  const data = readStore()
  data.settings = { ...data.settings, ...settings }
  writeStore(data)
}

export function getAgentPresets(): AgentPreset[] {
  return readStore().agentPresets
}

export function getAgentPresetByHandle(handle: string): AgentPreset | null {
  const lower = handle.toLowerCase()
  return readStore().agentPresets.find((p) => p.handle === lower) ?? null
}

export function createAgentPreset(input: { handle: string; name: string; prompt: string }): AgentPreset {
  const data = readStore()
  const handle = input.handle.toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (data.agentPresets.some((p) => p.handle === handle)) {
    throw new Error(`Agent with handle @${handle} already exists`)
  }
  const now = Date.now()
  const preset: AgentPreset = {
    id: crypto.randomUUID(),
    handle,
    name: input.name.trim(),
    prompt: input.prompt.trim(),
    createdAt: now,
    updatedAt: now
  }
  data.agentPresets.push(preset)
  writeStore(data)
  return preset
}

export function updateAgentPreset(
  id: string,
  input: { handle?: string; name?: string; prompt?: string }
): AgentPreset | null {
  const data = readStore()
  const preset = data.agentPresets.find((p) => p.id === id)
  if (!preset) return null

  if (input.handle !== undefined) {
    const newHandle = input.handle.toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (data.agentPresets.some((p) => p.handle === newHandle && p.id !== id)) {
      throw new Error(`Agent with handle @${newHandle} already exists`)
    }
    preset.handle = newHandle
  }
  if (input.name !== undefined) preset.name = input.name.trim()
  if (input.prompt !== undefined) preset.prompt = input.prompt.trim()
  preset.updatedAt = Date.now()
  writeStore(data)
  return preset
}

export function deleteAgentPreset(id: string): void {
  const data = readStore()
  data.agentPresets = data.agentPresets.filter((p) => p.id !== id)
  writeStore(data)
}

function normalizeStoreData(input: StoreData): { data: StoreData; changed: boolean } {
  let changed = false
  const chats = (input.chats ?? []).map((chat) => {
    const normalized = normalizeChat(chat)
    if (normalized.changed) changed = true
    return normalized.chat
  })

  const settings = { ...DEFAULT_DATA.settings, ...(input.settings ?? {}) }
  if (
    !input.settings ||
    typeof input.settings.proxyUrl !== 'string' ||
    typeof input.settings.model !== 'string' ||
    typeof input.settings.memoryModel !== 'string' ||
    typeof input.settings.openRouterApiKey !== 'string'
  ) {
    changed = true
  }

  const agentPresets = Array.isArray(input.agentPresets) ? input.agentPresets : []
  if (!Array.isArray(input.agentPresets)) changed = true

  return {
    data: {
      chats,
      settings,
      agentPresets
    },
    changed
  }
}

function normalizeChat(chat: Chat): { chat: Chat; changed: boolean } {
  const legacy = chat as Chat & { messages?: ChatMessage[] }
  const now = Date.now()

  if (Array.isArray(chat.threads) && typeof chat.mainThreadId === 'string' && chat.mainThreadId.length > 0) {
    const normalizedThreads: ChatThread[] = chat.threads.map((thread) => ({
      ...thread,
      chatId: chat.id,
      parentThreadId: thread.parentThreadId ?? null,
      forkFromMessageId: thread.forkFromMessageId ?? null,
      title: thread.title || 'Thread',
      messages: Array.isArray(thread.messages) ? thread.messages : [],
      createdAt: Number.isFinite(thread.createdAt) ? thread.createdAt : chat.createdAt ?? now,
      updatedAt: Number.isFinite(thread.updatedAt) ? thread.updatedAt : chat.updatedAt ?? now
    }))

    const hasMainThread = normalizedThreads.some((thread) => thread.id === chat.mainThreadId)
    if (hasMainThread) {
      return {
        chat: {
          ...chat,
          threads: normalizedThreads
        },
        changed: false
      }
    }
  }

  const mainThreadId = `${chat.id}-main`
  const migrated: Chat = {
    id: chat.id,
    title: chat.title || 'New Chat',
    mainThreadId,
    threads: [
      {
        id: mainThreadId,
        chatId: chat.id,
        parentThreadId: null,
        forkFromMessageId: null,
        title: 'Main',
        messages: Array.isArray(legacy.messages) ? legacy.messages : [],
        createdAt: Number.isFinite(chat.createdAt) ? chat.createdAt : now,
        updatedAt: Number.isFinite(chat.updatedAt) ? chat.updatedAt : now
      }
    ],
    createdAt: Number.isFinite(chat.createdAt) ? chat.createdAt : now,
    updatedAt: Number.isFinite(chat.updatedAt) ? chat.updatedAt : now
  }

  return { chat: migrated, changed: true }
}

function findThread(chat: Chat, threadId: string): ChatThread | undefined {
  return chat.threads.find((thread) => thread.id === threadId)
}

function findThreadContainingMessage(chat: Chat, messageId: string): ChatThread | undefined {
  return chat.threads.find((thread) => thread.messages.some((message) => message.id === messageId))
}

function cloneMessageWithNewId(message: ChatMessage): ChatMessage {
  return {
    ...message,
    id: crypto.randomUUID(),
    attachments: message.attachments?.map((attachment) => ({ ...attachment }))
  }
}
