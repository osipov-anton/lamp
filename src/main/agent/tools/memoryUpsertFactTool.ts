import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolInput,
  ToolProgressEvent,
  ToolResult
} from '../runtime/types'
import type { MemoryGraphPort } from '../../storage/ports/MemoryGraphPort'

export const MEMORY_UPSERT_FACT_TOOL_ID = 'memory_upsert_fact'

const SIMILARITY_THRESHOLD = 0.85

export function createMemoryUpsertFactTool(memory: MemoryGraphPort): ToolDefinition {
  return {
    id: MEMORY_UPSERT_FACT_TOOL_ID,
    version: '2.0.0',
    name: MEMORY_UPSERT_FACT_TOOL_ID,
    description:
      'Create or update a fact. If a similar fact already exists (by embedding similarity), ' +
      'returns a WARNING with the existing facts instead of inserting. ' +
      'To update an existing fact, pass its factId. To force-create despite similarity, set force=true.',
    inputSchema: {
      type: 'object',
      properties: {
        factId: { type: 'string', description: 'Pass existing factId to update instead of create' },
        statement: { type: 'string' },
        factType: { type: 'string' },
        confidence: { type: 'number' },
        force: { type: 'boolean', description: 'Set true to skip duplicate check and force insert' },
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

      const force = Boolean(input.arguments.force)
      const hasFactId = typeof input.arguments.factId === 'string'

      if (!force && !hasFactId) {
        const similar = await memory.queryFacts({ query: statement, limit: 3 })
        const duplicates = similar.filter((h) => h.score >= SIMILARITY_THRESHOLD)

        if (duplicates.length > 0) {
          const lines = duplicates.map(
            (h) => `- [factId: ${h.fact.factId}] "${h.fact.statement}" (score=${h.score.toFixed(2)}, conf=${h.fact.confidence.toFixed(2)})`
          )
          const warning =
            'WARNING: Similar facts already exist:\n' +
            lines.join('\n') +
            '\n\nTo update an existing fact, call again with its factId.\n' +
            'To create a new fact despite similarity, call again with force=true.'

          return {
            callId: '',
            toolId: MEMORY_UPSERT_FACT_TOOL_ID,
            success: true,
            content: [{ type: 'text', text: warning }],
            durationMs: 0
          }
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
