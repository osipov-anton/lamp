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
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  attachments?: MessageAttachment[]
  toolCalls?: ToolCallState[]
}

export interface MessageAttachment {
  id: string
  name: string
  filePath: string
  mimeType: string
  size: number
  isImage: boolean
  previewDataUrl?: string
}

export interface AppSettings {
  openRouterApiKey: string
  model: string
  proxyUrl: string
  telegramSession?: string
}

// === Agent runtime phase (mirrors main process) ============================

export type AgentRuntimePhase =
  | 'init'
  | 'thinking'
  | 'tool_call'
  | 'observing'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled'

// === Tool lifecycle (mirrors main process) =================================

export type ToolLifecycleStatus =
  | 'queued'
  | 'started'
  | 'progress'
  | 'partial_output'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface ToolCallState {
  key: string
  runId: string
  agentId?: string
  callId: string
  toolId: string
  toolName: string
  status: ToolLifecycleStatus
  statusText?: string
  phase?: string
  percent?: number
  elapsedMs: number
  preview?: string
  result?: {
    success: boolean
    content?: string
    memoryQueryHits?: MemoryQueryHit[]
    imagePath?: string
    error?: string
  }
}

export interface MemoryQueryHit {
  factId: string
  statement: string
  factType: string
  confidence: number
  priority: number
  score: number
  source?: 'related'
}

export interface RunState {
  runId: string
  chatId: string
  phase: AgentRuntimePhase
  iteration: number
  toolCalls: ToolCallState[]
  thinkingContent: string
  streamingContent: string
}

// === Agent IPC event payloads ==============================================

export interface AgentStreamChunkPayload {
  chatId: string
  threadId: string
  runId: string
  chunk: string
}

export interface AgentThinkingChunkPayload {
  chatId: string
  threadId: string
  runId: string
  chunk: string
}

export interface AgentToolLifecyclePayload {
  chatId: string
  threadId: string
  runId: string
  agentId?: string
  callId: string
  toolId: string
  toolName: string
  status: ToolLifecycleStatus
  statusText?: string
  phase?: string
  percent?: number
  elapsedMs: number
  preview?: string
  timestamp: number
}

export interface AgentImageAttachmentPayload {
  chatId: string
  threadId: string
  runId: string
  callId: string
  mimeType: string
  filePath: string
  alt?: string
}

export interface AgentToolResultPayload {
  chatId: string
  threadId: string
  runId: string
  callId: string
  toolId: string
  text: string
}

export interface AgentRunStatePayload {
  chatId: string
  threadId: string
  runId: string
  phase: AgentRuntimePhase
  iteration: number
}

export interface AgentRunCompletePayload {
  chatId: string
  threadId: string
  runId: string
  messageId: string
}

export interface AgentRunErrorPayload {
  chatId: string
  threadId: string
  runId: string
  error: string
}

// === API contracts =========================================================

export interface ChatAPI {
  createChat: () => Promise<Chat>
  deleteChat: (id: string) => Promise<void>
  deleteThread: (chatId: string, threadId: string) => Promise<void>
  listChats: () => Promise<Chat[]>
  getChat: (id: string) => Promise<Chat | null>
  createThread: (payload: {
    chatId: string
    sourceThreadId: string
    messageId: string
    anchorQuote?: string
  }) => Promise<ChatThread | null>
  pickAttachments: () => Promise<MessageAttachment[]>
  sendMessage: (
    chatId: string,
    threadId: string,
    content: string,
    attachments?: MessageAttachment[]
  ) => Promise<void>
  stopStream: (chatId: string, threadId?: string) => Promise<{ cancelledRuns: number }>
  onStreamChunk: (callback: (data: { chatId: string; threadId: string; chunk: string }) => void) => () => void
  onStreamEnd: (
    callback: (data: { chatId: string; threadId: string; messageId: string }) => void
  ) => () => void
  onStreamError: (
    callback: (data: { chatId: string; threadId: string; error: string }) => void
  ) => () => void
}

export interface AgentAPI {
  onStreamChunk: (cb: (data: AgentStreamChunkPayload) => void) => () => void
  onThinkingChunk: (cb: (data: AgentThinkingChunkPayload) => void) => () => void
  onToolLifecycle: (cb: (data: AgentToolLifecyclePayload) => void) => () => void
  onToolResult: (cb: (data: AgentToolResultPayload) => void) => () => void
  onImageAttachment: (cb: (data: AgentImageAttachmentPayload) => void) => () => void
  onRunState: (cb: (data: AgentRunStatePayload) => void) => () => void
  onRunComplete: (cb: (data: AgentRunCompletePayload) => void) => () => void
  onRunError: (cb: (data: AgentRunErrorPayload) => void) => () => void
}

export interface SettingsAPI {
  get: () => Promise<AppSettings>
  save: (settings: AppSettings) => Promise<void>
  fetchModels: () => Promise<Array<{ id: string; name: string }>>
}

export type TelegramConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export interface TelegramAPI {
  sendCode: (phone: string) => Promise<void>
  signIn: (code: string) => Promise<{ requires2FA: boolean }>
  submit2FA: (password: string) => Promise<void>
  disconnect: () => Promise<void>
  getStatus: () => Promise<TelegramConnectionStatus>
  onStatusChanged: (cb: (status: TelegramConnectionStatus) => void) => () => void
}

export type GoogleConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export interface GoogleUserInfo {
  email: string
  name: string
  picture?: string
}

export interface GoogleAPI {
  startAuth: () => Promise<void>
  disconnect: () => Promise<void>
  getStatus: () => Promise<GoogleConnectionStatus>
  getUserInfo: () => Promise<GoogleUserInfo | null>
  onStatusChanged: (cb: (status: GoogleConnectionStatus) => void) => () => void
}

// === Memory types ============================================================

export type MemoryEntityType =
  | 'person'
  | 'project'
  | 'task'
  | 'org'
  | 'tool'
  | 'topic'
  | 'channel_account'
  | 'chat'

export interface FactEntityRef {
  entityId: string
  entityType: MemoryEntityType
  label: string
  role: 'about' | 'owns' | 'prefers' | 'blocked_by' | 'works_on'
}

export interface MemoryFact {
  factId: string
  statement: string
  factType: string
  confidence: number
  priority: number
  recency: number
  entityRefs: FactEntityRef[]
  sourceMessageIds: Array<{ messageId: string; chatId: string }>
  isArchived: boolean
  supersededBy?: string
  createdAt: number
  updatedAt: number
}

export interface MemoryChannelIdentity {
  channelType: 'telegram' | 'email' | 'whatsapp' | 'local_chat'
  externalId: string
  displayName: string
  confidence: number
  status: 'confirmed' | 'pending_review'
}

export interface MemoryEntity {
  entityId: string
  entityType: MemoryEntityType
  labels: string
  aliases: string[]
  channelIdentities: MemoryChannelIdentity[]
  mergedInto?: string
  createdAt: number
  updatedAt: number
}

export interface MemoryAPI {
  listFacts: (options?: { includeArchived?: boolean }) => Promise<MemoryFact[]>
  listEntities: () => Promise<MemoryEntity[]>
  deleteFact: (factId: string) => Promise<boolean>
  deleteEntity: (entityId: string) => Promise<boolean>
}

// === Agent Presets ============================================================

export interface AgentPreset {
  id: string
  handle: string
  name: string
  prompt: string
  createdAt: number
  updatedAt: number
}

export interface AgentPresetsAPI {
  list: () => Promise<AgentPreset[]>
  create: (data: { handle: string; name: string; prompt: string }) => Promise<AgentPreset>
  update: (id: string, data: { handle?: string; name?: string; prompt?: string }) => Promise<AgentPreset | null>
  delete: (id: string) => Promise<void>
  improvePrompt: (draft: string) => Promise<string>
}

declare global {
  interface Window {
    api: {
      chat: ChatAPI
      agent: AgentAPI
      settings: SettingsAPI
      telegram: TelegramAPI
      google: GoogleAPI
      memory: MemoryAPI
      agentPresets: AgentPresetsAPI
    }
  }
}
