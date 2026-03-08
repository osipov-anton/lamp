import type {
  ToolDefinition,
  ToolInput,
  ToolExecutionContext,
  ToolProgressEvent,
  ToolResult
} from '../runtime/types'
import type { TelegramService } from '../../telegram'

export const TELEGRAM_LIST_CHATS_ID = 'telegram_list_chats'
export const TELEGRAM_LIST_CONTACTS_ID = 'telegram_list_contacts'
export const TELEGRAM_READ_MESSAGES_ID = 'telegram_read_messages'
export const TELEGRAM_SEND_MESSAGE_ID = 'telegram_send_message'
export const TELEGRAM_SEARCH_MESSAGES_ID = 'telegram_search_messages'

export const ALL_TELEGRAM_TOOL_IDS = [
  TELEGRAM_LIST_CHATS_ID,
  TELEGRAM_LIST_CONTACTS_ID,
  TELEGRAM_READ_MESSAGES_ID,
  TELEGRAM_SEND_MESSAGE_ID,
  TELEGRAM_SEARCH_MESSAGES_ID
]

function notConnectedResult(toolId: string): ToolResult {
  return {
    callId: '',
    toolId,
    success: false,
    content: [],
    error: 'Telegram is not connected. Ask the user to connect Telegram in Settings → Integrations.',
    durationMs: 0
  }
}

// ---------------------------------------------------------------------------
// telegram_list_chats
// ---------------------------------------------------------------------------

export function createTelegramListChatsTool(service: TelegramService): ToolDefinition {
  return {
    id: TELEGRAM_LIST_CHATS_ID,
    version: '1.0.0',
    name: TELEGRAM_LIST_CHATS_ID,
    description:
      "List the user's recent Telegram chats/dialogs with last message preview and unread count.",
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of chats to return (default: 20, max: 50)'
        }
      }
    },

    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      if (!service.isConnected()) return notConnectedResult(TELEGRAM_LIST_CHATS_ID)

      const startTime = Date.now()
      const limit = Math.min(
        typeof input.arguments.limit === 'number' ? input.arguments.limit : 20,
        50
      )

      yield {
        callId: '',
        toolId: TELEGRAM_LIST_CHATS_ID,
        status: 'started',
        statusText: 'Fetching Telegram chats...',
        phase: 'requesting',
        elapsedMs: 0
      }

      try {
        const dialogs = await service.listDialogs(limit)
        const lines = dialogs.map((d, i) => {
          const unread = d.unreadCount > 0 ? ` [${d.unreadCount} unread]` : ''
          const preview = d.lastMessage ? ` — "${d.lastMessage.slice(0, 80)}"` : ''
          return `${i + 1}. ${d.title}${unread}${preview}`
        })
        const text = lines.length > 0 ? lines.join('\n') : 'No chats found.'

        return {
          callId: '',
          toolId: TELEGRAM_LIST_CHATS_ID,
          success: true,
          content: [{ type: 'text', text }],
          durationMs: Date.now() - startTime
        }
      } catch (err) {
        return {
          callId: '',
          toolId: TELEGRAM_LIST_CHATS_ID,
          success: false,
          content: [],
          error: err instanceof Error ? err.message : 'Failed to list chats',
          durationMs: Date.now() - startTime
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// telegram_list_contacts
// ---------------------------------------------------------------------------

export function createTelegramListContactsTool(service: TelegramService): ToolDefinition {
  return {
    id: TELEGRAM_LIST_CONTACTS_ID,
    version: '1.0.0',
    name: TELEGRAM_LIST_CONTACTS_ID,
    description:
      "List the user's Telegram contacts with display names, usernames, and phone numbers (if available).",
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of contacts to return (default: 50, max: 200)'
        }
      }
    },

    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      if (!service.isConnected()) return notConnectedResult(TELEGRAM_LIST_CONTACTS_ID)

      const startTime = Date.now()
      const limit = Math.min(
        typeof input.arguments.limit === 'number' ? input.arguments.limit : 50,
        200
      )

      yield {
        callId: '',
        toolId: TELEGRAM_LIST_CONTACTS_ID,
        status: 'started',
        statusText: 'Fetching Telegram contacts...',
        phase: 'requesting',
        elapsedMs: 0
      }

      try {
        const contacts = await service.listContacts(limit)
        const lines = contacts.map((c, i) => {
          const username = c.username ? ` @${c.username}` : ''
          const phone = c.phone ? `, phone: ${c.phone}` : ''
          const bot = c.isBot ? ', bot' : ''
          return `${i + 1}. ${c.displayName}${username}${phone}${bot}`
        })
        const text = lines.length > 0 ? lines.join('\n') : 'No contacts found.'

        return {
          callId: '',
          toolId: TELEGRAM_LIST_CONTACTS_ID,
          success: true,
          content: [{ type: 'text', text }],
          durationMs: Date.now() - startTime
        }
      } catch (err) {
        return {
          callId: '',
          toolId: TELEGRAM_LIST_CONTACTS_ID,
          success: false,
          content: [],
          error: err instanceof Error ? err.message : 'Failed to list contacts',
          durationMs: Date.now() - startTime
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// telegram_read_messages
// ---------------------------------------------------------------------------

export function createTelegramReadMessagesTool(service: TelegramService): ToolDefinition {
  return {
    id: TELEGRAM_READ_MESSAGES_ID,
    version: '1.0.0',
    name: TELEGRAM_READ_MESSAGES_ID,
    description:
      'Read recent messages from a specific Telegram chat. Provide the chat title or @username.',
    inputSchema: {
      type: 'object',
      properties: {
        chat_name: {
          type: 'string',
          description: 'Chat title, @username, or display name to read messages from'
        },
        limit: {
          type: 'number',
          description: 'Number of messages to retrieve (default: 20, max: 50)'
        }
      },
      required: ['chat_name']
    },

    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      if (!service.isConnected()) return notConnectedResult(TELEGRAM_READ_MESSAGES_ID)

      const chatName = String(input.arguments.chat_name ?? '').trim()
      if (!chatName) {
        return {
          callId: '',
          toolId: TELEGRAM_READ_MESSAGES_ID,
          success: false,
          content: [],
          error: 'chat_name is required',
          durationMs: 0
        }
      }

      const startTime = Date.now()
      const limit = Math.min(
        typeof input.arguments.limit === 'number' ? input.arguments.limit : 20,
        50
      )

      yield {
        callId: '',
        toolId: TELEGRAM_READ_MESSAGES_ID,
        status: 'started',
        statusText: `Reading messages from "${chatName}"...`,
        phase: 'requesting',
        elapsedMs: 0
      }

      try {
        const messages = await service.getMessages(chatName, limit)
        let imageIndex = 0
        const lines = messages.map((m) => {
          const date = new Date(m.date).toLocaleString()
          const imageSummary =
            m.images && m.images.length > 0
              ? ` [${m.images.length} image${m.images.length === 1 ? '' : 's'} attached]`
              : ''
          const text = m.text?.trim() ? m.text : '(no text)'
          return `[${date}] ${m.sender}: ${text}${imageSummary}`
        })
        const content = []
        const text =
          lines.length > 0
            ? `Messages from "${chatName}" (${lines.length}):\n${lines.join('\n')}`
            : `No messages found in "${chatName}".`

        content.push({ type: 'text' as const, text })
        for (const message of messages) {
          for (const image of message.images ?? []) {
            imageIndex += 1
            const date = new Date(message.date).toLocaleString()
            const caption = message.text?.trim() ? ` Caption: ${message.text.trim()}` : ''
            content.push({
              type: 'image' as const,
              mimeType: image.mimeType,
              filePath: image.filePath,
              alt: `Telegram image ${imageIndex} from ${message.sender} at ${date}.${caption}`
            })
          }
        }

        return {
          callId: '',
          toolId: TELEGRAM_READ_MESSAGES_ID,
          success: true,
          content,
          durationMs: Date.now() - startTime
        }
      } catch (err) {
        return {
          callId: '',
          toolId: TELEGRAM_READ_MESSAGES_ID,
          success: false,
          content: [],
          error: err instanceof Error ? err.message : 'Failed to read messages',
          durationMs: Date.now() - startTime
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// telegram_send_message
// ---------------------------------------------------------------------------

export function createTelegramSendMessageTool(service: TelegramService): ToolDefinition {
  return {
    id: TELEGRAM_SEND_MESSAGE_ID,
    version: '1.0.0',
    name: TELEGRAM_SEND_MESSAGE_ID,
    description:
      'Send a message to a Telegram chat. ALWAYS confirm with the user before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        chat_name: {
          type: 'string',
          description: 'Chat title, @username, or display name to send the message to'
        },
        text: {
          type: 'string',
          description: 'The message text to send'
        }
      },
      required: ['chat_name', 'text']
    },

    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      if (!service.isConnected()) return notConnectedResult(TELEGRAM_SEND_MESSAGE_ID)

      const chatName = String(input.arguments.chat_name ?? '').trim()
      const text = String(input.arguments.text ?? '').trim()

      if (!chatName || !text) {
        return {
          callId: '',
          toolId: TELEGRAM_SEND_MESSAGE_ID,
          success: false,
          content: [],
          error: 'Both chat_name and text are required',
          durationMs: 0
        }
      }

      const startTime = Date.now()

      yield {
        callId: '',
        toolId: TELEGRAM_SEND_MESSAGE_ID,
        status: 'started',
        statusText: `Sending message to "${chatName}"...`,
        phase: 'sending',
        elapsedMs: 0
      }

      try {
        const result = await service.sendMessage(chatName, text)
        return {
          callId: '',
          toolId: TELEGRAM_SEND_MESSAGE_ID,
          success: true,
          content: [
            {
              type: 'text',
              text: `Message sent to "${chatName}" (id: ${result.messageId})`
            }
          ],
          durationMs: Date.now() - startTime
        }
      } catch (err) {
        return {
          callId: '',
          toolId: TELEGRAM_SEND_MESSAGE_ID,
          success: false,
          content: [],
          error: err instanceof Error ? err.message : 'Failed to send message',
          durationMs: Date.now() - startTime
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// telegram_search_messages
// ---------------------------------------------------------------------------

export function createTelegramSearchMessagesTool(service: TelegramService): ToolDefinition {
  return {
    id: TELEGRAM_SEARCH_MESSAGES_ID,
    version: '1.0.0',
    name: TELEGRAM_SEARCH_MESSAGES_ID,
    description:
      'Search messages in Telegram. Can search globally or within a specific chat.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query text'
        },
        chat_name: {
          type: 'string',
          description: 'Optional: limit search to a specific chat (title or @username)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 20, max: 50)'
        }
      },
      required: ['query']
    },

    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      if (!service.isConnected()) return notConnectedResult(TELEGRAM_SEARCH_MESSAGES_ID)

      const query = String(input.arguments.query ?? '').trim()
      if (!query) {
        return {
          callId: '',
          toolId: TELEGRAM_SEARCH_MESSAGES_ID,
          success: false,
          content: [],
          error: 'query is required',
          durationMs: 0
        }
      }

      const chatName =
        typeof input.arguments.chat_name === 'string'
          ? input.arguments.chat_name.trim() || undefined
          : undefined
      const limit = Math.min(
        typeof input.arguments.limit === 'number' ? input.arguments.limit : 20,
        50
      )
      const startTime = Date.now()

      const scope = chatName ? `in "${chatName}"` : 'globally'
      yield {
        callId: '',
        toolId: TELEGRAM_SEARCH_MESSAGES_ID,
        status: 'started',
        statusText: `Searching ${scope}: "${query}"...`,
        phase: 'searching',
        elapsedMs: 0
      }

      try {
        const results = await service.searchMessages(query, chatName, limit)
        let imageIndex = 0
        const lines = results.map((r) => {
          const date = new Date(r.date).toLocaleString()
          const chat = r.chatTitle ? `[${r.chatTitle}] ` : ''
          const imageSummary =
            r.images && r.images.length > 0
              ? ` [${r.images.length} image${r.images.length === 1 ? '' : 's'} attached]`
              : ''
          const text = r.text?.trim() ? r.text : '(no text)'
          return `${chat}[${date}] ${r.sender}: ${text}${imageSummary}`
        })
        const content = []
        const text =
          lines.length > 0
            ? `Found ${lines.length} result(s) for "${query}" ${scope}:\n${lines.join('\n')}`
            : `No results found for "${query}" ${scope}.`

        content.push({ type: 'text' as const, text })
        for (const result of results) {
          for (const image of result.images ?? []) {
            imageIndex += 1
            const date = new Date(result.date).toLocaleString()
            const chat = result.chatTitle ? ` in ${result.chatTitle}` : ''
            const caption = result.text?.trim() ? ` Caption: ${result.text.trim()}` : ''
            content.push({
              type: 'image' as const,
              mimeType: image.mimeType,
              filePath: image.filePath,
              alt: `Telegram search image ${imageIndex} from ${result.sender}${chat} at ${date}.${caption}`
            })
          }
        }

        return {
          callId: '',
          toolId: TELEGRAM_SEARCH_MESSAGES_ID,
          success: true,
          content,
          durationMs: Date.now() - startTime
        }
      } catch (err) {
        return {
          callId: '',
          toolId: TELEGRAM_SEARCH_MESSAGES_ID,
          success: false,
          content: [],
          error: err instanceof Error ? err.message : 'Search failed',
          durationMs: Date.now() - startTime
        }
      }
    }
  }
}
