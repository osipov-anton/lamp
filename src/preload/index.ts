import { contextBridge, ipcRenderer } from 'electron'

function ipcOn<T>(channel: string, callback: (data: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, data: T) => callback(data)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const chatAPI = {
  createChat: () => ipcRenderer.invoke('chat:create'),
  deleteChat: (id: string) => ipcRenderer.invoke('chat:delete', id),
  deleteThread: (chatId: string, threadId: string) => ipcRenderer.invoke('chat:delete-thread', chatId, threadId),
  listChats: () => ipcRenderer.invoke('chat:list'),
  getChat: (id: string) => ipcRenderer.invoke('chat:get', id),
  createThread: (payload: { chatId: string; sourceThreadId: string; messageId: string; anchorQuote?: string }) =>
    ipcRenderer.invoke('chat:create-thread', payload),
  pickAttachments: () => ipcRenderer.invoke('chat:pick-attachments'),
  sendMessage: (chatId: string, threadId: string, content: string, attachments: unknown[] = []) =>
    ipcRenderer.invoke('chat:send-message', chatId, threadId, content, attachments),
  stopStream: (chatId: string, threadId?: string) => ipcRenderer.invoke('chat:stop-stream', chatId, threadId),
  onStreamChunk: (cb: (data: { chatId: string; threadId: string; chunk: string }) => void) =>
    ipcOn('chat:stream-chunk', cb),
  onStreamEnd: (cb: (data: { chatId: string; threadId: string; messageId: string }) => void) =>
    ipcOn('chat:stream-end', cb),
  onStreamError: (cb: (data: { chatId: string; threadId: string; error: string }) => void) =>
    ipcOn('chat:stream-error', cb)
}

const agentAPI = {
  onStreamChunk: (cb: (data: { chatId: string; threadId: string; runId: string; chunk: string }) => void) =>
    ipcOn('agent:stream-chunk', cb),
  onThinkingChunk: (cb: (data: { chatId: string; threadId: string; runId: string; chunk: string }) => void) =>
    ipcOn('agent:thinking-chunk', cb),
  onToolLifecycle: (cb: (data: Record<string, unknown>) => void) =>
    ipcOn('agent:tool-lifecycle', cb),
  onToolResult: (cb: (data: Record<string, unknown>) => void) =>
    ipcOn('agent:tool-result', cb),
  onImageAttachment: (cb: (data: Record<string, unknown>) => void) =>
    ipcOn('agent:image-attachment', cb),
  onRunState: (cb: (data: { chatId: string; threadId: string; runId: string; phase: string; iteration: number }) => void) =>
    ipcOn('agent:run-state', cb),
  onRunComplete: (cb: (data: { chatId: string; threadId: string; runId: string; messageId: string }) => void) =>
    ipcOn('agent:run-complete', cb),
  onRunError: (cb: (data: { chatId: string; threadId: string; runId: string; error: string }) => void) =>
    ipcOn('agent:run-error', cb)
}

const settingsAPI = {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (settings: { openRouterApiKey: string; model: string; memoryModel: string; proxyUrl: string }) =>
    ipcRenderer.invoke('settings:save', settings),
  fetchModels: () =>
    ipcRenderer.invoke('settings:fetch-models') as Promise<
      Array<{ id: string; name: string }>
    >
}

const telegramAPI = {
  sendCode: (phone: string) => ipcRenderer.invoke('telegram:send-code', phone),
  signIn: (code: string) =>
    ipcRenderer.invoke('telegram:sign-in', code) as Promise<{ requires2FA: boolean }>,
  submit2FA: (password: string) => ipcRenderer.invoke('telegram:submit-2fa', password),
  disconnect: () => ipcRenderer.invoke('telegram:disconnect'),
  getStatus: () =>
    ipcRenderer.invoke('telegram:status') as Promise<
      'disconnected' | 'connecting' | 'connected'
    >,
  onStatusChanged: (cb: (status: 'disconnected' | 'connecting' | 'connected') => void) =>
    ipcOn('telegram:status-changed', cb)
}

const googleAPI = {
  startAuth: () => ipcRenderer.invoke('google:start-auth'),
  disconnect: () => ipcRenderer.invoke('google:disconnect'),
  getStatus: () =>
    ipcRenderer.invoke('google:status') as Promise<
      'disconnected' | 'connecting' | 'connected'
    >,
  getUserInfo: () =>
    ipcRenderer.invoke('google:user-info') as Promise<
      { email: string; name: string; picture?: string } | null
    >,
  onStatusChanged: (cb: (status: 'disconnected' | 'connecting' | 'connected') => void) =>
    ipcOn('google:status-changed', cb)
}

const memoryAPI = {
  listFacts: (options?: { includeArchived?: boolean }) =>
    ipcRenderer.invoke('memory:list-facts', options),
  listEntities: () => ipcRenderer.invoke('memory:list-entities'),
  deleteFact: (factId: string) =>
    ipcRenderer.invoke('memory:delete-fact', factId) as Promise<boolean>,
  deleteEntity: (entityId: string) =>
    ipcRenderer.invoke('memory:delete-entity', entityId) as Promise<boolean>,
  reindex: () =>
    ipcRenderer.invoke('memory:reindex') as Promise<{
      messages: number; facts: number; entities: number
    }>
}

const agentPresetsAPI = {
  list: () =>
    ipcRenderer.invoke('agent-preset:list') as Promise<
      Array<{ id: string; handle: string; name: string; prompt: string; createdAt: number; updatedAt: number }>
    >,
  create: (data: { handle: string; name: string; prompt: string }) =>
    ipcRenderer.invoke('agent-preset:create', data),
  update: (id: string, data: { handle?: string; name?: string; prompt?: string }) =>
    ipcRenderer.invoke('agent-preset:update', id, data),
  delete: (id: string) => ipcRenderer.invoke('agent-preset:delete', id),
  improvePrompt: (draft: string) =>
    ipcRenderer.invoke('agent-preset:improve-prompt', draft) as Promise<string>
}

const integrationsAPI = {
  list: () =>
    ipcRenderer.invoke('integrations:list') as Promise<unknown[]>,
  get: (id: string) =>
    ipcRenderer.invoke('integrations:get', id),
  approve: (id: string, envValues: Record<string, string>) =>
    ipcRenderer.invoke('integrations:approve', id, envValues) as Promise<{ success: boolean; error?: string }>,
  reject: (id: string) =>
    ipcRenderer.invoke('integrations:reject', id),
  delete: (id: string) =>
    ipcRenderer.invoke('integrations:delete', id),
  reinstall: (id: string) =>
    ipcRenderer.invoke('integrations:reinstall', id) as Promise<{ success: boolean; error?: string }>,
  onChanged: (cb: (data: unknown) => void) =>
    ipcOn('integrations:changed', cb)
}

const api = {
  chat: chatAPI,
  agent: agentAPI,
  settings: settingsAPI,
  telegram: telegramAPI,
  google: googleAPI,
  memory: memoryAPI,
  agentPresets: agentPresetsAPI,
  integrations: integrationsAPI
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}
