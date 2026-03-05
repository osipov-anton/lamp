import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolInput,
  ToolProgressEvent,
  ToolResult
} from '../runtime/types'
import type { MemoryGraphPort } from '../../storage/ports/MemoryGraphPort'

export const SEARCH_MESSAGES_TOOL_ID = 'search_messages'

export interface SearchMessagesToolConfig {
  memory: MemoryGraphPort
}

export function createSearchMessagesTool(config: SearchMessagesToolConfig): ToolDefinition {
  return {
    id: SEARCH_MESSAGES_TOOL_ID,
    version: '1.0.0',
    name: SEARCH_MESSAGES_TOOL_ID,
    description:
      'Search indexed chat messages across all chats. Useful for recalling prior discussions and decisions.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query for message search'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5)'
        },
        chatId: {
          type: 'string',
          description: 'Optional: limit search to one chat'
        },
        role: {
          type: 'string',
          enum: ['user', 'assistant', 'system'],
          description: 'Optional: filter by message role'
        }
      },
      required: ['query']
    },

    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      const query = String(input.arguments.query ?? '').trim()
      const limitRaw = input.arguments.limit
      const limit = typeof limitRaw === 'number' && Number.isFinite(limitRaw) ? limitRaw : 5
      const chatId = typeof input.arguments.chatId === 'string' ? input.arguments.chatId : undefined
      const role =
        input.arguments.role === 'user' ||
        input.arguments.role === 'assistant' ||
        input.arguments.role === 'system'
          ? input.arguments.role
          : undefined

      if (!query) {
        return {
          callId: '',
          toolId: SEARCH_MESSAGES_TOOL_ID,
          success: false,
          content: [],
          error: 'Argument "query" must be a non-empty string',
          durationMs: 0
        }
      }

      const startTime = Date.now()
      yield {
        callId: '',
        toolId: SEARCH_MESSAGES_TOOL_ID,
        status: 'started',
        statusText: `Searching messages: "${query}"`,
        phase: 'search',
        elapsedMs: 0
      }

      const hits = await config.memory.searchMessages(query, {
        limit: Math.max(1, Math.min(20, Math.floor(limit))),
        chatId,
        role
      })

      const output = formatHits(query, hits)
      return {
        callId: '',
        toolId: SEARCH_MESSAGES_TOOL_ID,
        success: true,
        content: [{ type: 'text', text: output }],
        durationMs: Date.now() - startTime
      }
    }
  }
}

function formatHits(
  query: string,
  hits: Awaited<ReturnType<MemoryGraphPort['searchMessages']>>
): string {
  if (hits.length === 0) {
    return `No indexed messages found for query: "${query}".`
  }

  const lines = [`Found ${hits.length} message(s) for "${query}":`]
  for (const [index, hit] of hits.entries()) {
    const timestamp = new Date(hit.message.timestamp).toISOString()
    const content = hit.message.content.replace(/\s+/g, ' ').trim()
    lines.push(
      `${index + 1}. [${hit.message.chatTitle || hit.message.chatId}] (${hit.message.role}, ${timestamp}, score=${hit.score.toFixed(3)}) ${content}`
    )
  }
  return lines.join('\n')
}
