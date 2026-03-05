import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolInput,
  ToolProgressEvent,
  ToolResult
} from '../runtime/types'
import type { MemoryGraphPort } from '../../storage/ports/MemoryGraphPort'

export const MEMORY_QUERY_TOOL_ID = 'memory_query'

export function createMemoryQueryTool(memory: MemoryGraphPort): ToolDefinition {
  return {
    id: MEMORY_QUERY_TOOL_ID,
    version: '1.0.0',
    name: MEMORY_QUERY_TOOL_ID,
    description: 'Search facts in memory graph with optional source messages.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        entityType: {
          type: 'string',
          enum: ['person', 'project', 'task', 'org', 'tool', 'topic', 'channel_account', 'chat']
        },
        factType: { type: 'string' },
        includeArchived: { type: 'boolean' },
        includeSourceMessages: { type: 'boolean' },
        limit: { type: 'number' }
      },
      required: ['query']
    },
    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      const query = String(input.arguments.query ?? '').trim()
      if (!query) {
        return {
          callId: '',
          toolId: MEMORY_QUERY_TOOL_ID,
          success: false,
          content: [],
          error: 'query is required',
          durationMs: 0
        }
      }

      const includeSourceMessages = Boolean(input.arguments.includeSourceMessages)
      const limitRaw = Number(input.arguments.limit ?? 10)
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(25, Math.floor(limitRaw))) : 10
      const hits = await memory.queryFacts({
        query,
        limit,
        includeArchived: Boolean(input.arguments.includeArchived),
        factType: typeof input.arguments.factType === 'string' ? input.arguments.factType : undefined,
        entityType: typeof input.arguments.entityType === 'string' ? (input.arguments.entityType as never) : undefined
      })

      const output = await Promise.all(
        hits.map(async (hit) => {
          const base = {
            factId: hit.fact.factId,
            statement: hit.fact.statement,
            factType: hit.fact.factType,
            confidence: hit.fact.confidence,
            priority: hit.fact.priority,
            entityRefs: hit.fact.entityRefs,
            score: hit.score
          }
          if (!includeSourceMessages) return base
          const sourceMessages = await Promise.all(
            hit.fact.sourceMessageIds.map(async (source) => {
              const message = await memory.getMessageById(source.messageId)
              if (!message) {
                return {
                  messageId: source.messageId,
                  chatId: source.chatId,
                  missing: true
                }
              }
              return {
                messageId: message.messageId,
                chatId: message.chatId,
                chatTitle: message.chatTitle,
                role: message.role,
                senderName: message.senderName,
                content: message.content.slice(0, 200),
                timestamp: message.timestamp
              }
            })
          )
          return { ...base, sourceMessages }
        })
      )

      return {
        callId: '',
        toolId: MEMORY_QUERY_TOOL_ID,
        success: true,
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        durationMs: 0
      }
    }
  }
}
