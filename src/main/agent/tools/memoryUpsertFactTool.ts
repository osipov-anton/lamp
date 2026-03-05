import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolInput,
  ToolProgressEvent,
  ToolResult
} from '../runtime/types'
import type { MemoryGraphPort } from '../../storage/ports/MemoryGraphPort'

export const MEMORY_UPSERT_FACT_TOOL_ID = 'memory_upsert_fact'

export function createMemoryUpsertFactTool(memory: MemoryGraphPort): ToolDefinition {
  return {
    id: MEMORY_UPSERT_FACT_TOOL_ID,
    version: '1.0.0',
    name: MEMORY_UPSERT_FACT_TOOL_ID,
    description: 'Create or update fact with source message provenance.',
    inputSchema: {
      type: 'object',
      properties: {
        factId: { type: 'string' },
        statement: { type: 'string' },
        factType: { type: 'string' },
        confidence: { type: 'number' },
        entityRefs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              entityId: { type: 'string' },
              entityType: {
                type: 'string',
                enum: ['person', 'project', 'task', 'org', 'tool', 'topic', 'channel_account', 'chat']
              },
              label: { type: 'string' },
              role: {
                type: 'string',
                enum: ['about', 'owns', 'prefers', 'blocked_by', 'works_on']
              }
            },
            required: ['entityType', 'label', 'role']
          }
        },
        supersedes: { type: 'string' },
        sourceMessageIds: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              messageId: { type: 'string' },
              chatId: { type: 'string' }
            },
            required: ['messageId', 'chatId']
          }
        }
      },
      required: ['statement', 'factType', 'confidence', 'entityRefs', 'sourceMessageIds']
    },
    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      const statement = String(input.arguments.statement ?? '').trim()
      if (!statement) {
        return {
          callId: '',
          toolId: MEMORY_UPSERT_FACT_TOOL_ID,
          success: false,
          content: [],
          error: 'statement is required',
          durationMs: 0
        }
      }

      const entityRefs = Array.isArray(input.arguments.entityRefs) ? input.arguments.entityRefs : []
      const sourceMessageIds = Array.isArray(input.arguments.sourceMessageIds) ? input.arguments.sourceMessageIds : []
      const fact = await memory.upsertFact({
        factId: typeof input.arguments.factId === 'string' ? input.arguments.factId : undefined,
        statement,
        factType: String(input.arguments.factType ?? 'general'),
        confidence: Number(input.arguments.confidence ?? 0.5),
        entityRefs: entityRefs as never,
        supersedes: typeof input.arguments.supersedes === 'string' ? input.arguments.supersedes : undefined,
        sourceMessageIds: sourceMessageIds as never
      })

      return {
        callId: '',
        toolId: MEMORY_UPSERT_FACT_TOOL_ID,
        success: true,
        content: [{ type: 'text', text: JSON.stringify(fact, null, 2) }],
        durationMs: 0
      }
    }
  }
}
