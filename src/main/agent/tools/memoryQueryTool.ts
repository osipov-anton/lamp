import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolInput,
  ToolProgressEvent,
  ToolResult
} from '../runtime/types'
import type { MemoryGraphPort, FactSearchHit } from '../../storage/ports/MemoryGraphPort'

export const MEMORY_QUERY_TOOL_ID = 'memory_query'

function parseQueries(args: Record<string, unknown>): string[] {
  if (Array.isArray(args.queries)) {
    return args.queries.map((q) => String(q).trim()).filter(Boolean)
  }
  const single = String(args.query ?? '').trim()
  return single ? [single] : []
}

export function createMemoryQueryTool(memory: MemoryGraphPort): ToolDefinition {
  return {
    id: MEMORY_QUERY_TOOL_ID,
    version: '2.0.0',
    name: MEMORY_QUERY_TOOL_ID,
    description:
      'Search facts in memory graph. Provide multiple short queries (2-4) from different angles ' +
      'for better recall: name variants, transliterations, related topics. ' +
      'Set expandRelated=true to also fetch facts about entities found in initial results.',
    inputSchema: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string' },
          description: 'Multiple search queries from different angles. Keep each 3-5 words. Example: ["Elena Chasova", "Елена мама", "user mother"]'
        },
        query: { type: 'string', description: 'Single query (prefer queries[] for better results)' },
        expandRelated: {
          type: 'boolean',
          description: 'Fetch additional facts about entities found in initial results'
        },
        entityType: {
          type: 'string',
          enum: ['person', 'project', 'task', 'org', 'tool', 'topic', 'channel_account', 'chat']
        },
        factType: { type: 'string' },
        includeArchived: { type: 'boolean' },
        includeSourceMessages: { type: 'boolean' },
        limit: { type: 'number' }
      },
      required: []
    },
    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      const queries = parseQueries(input.arguments)
      if (queries.length === 0) {
        return {
          callId: '',
          toolId: MEMORY_QUERY_TOOL_ID,
          success: false,
          content: [],
          error: 'queries[] or query is required',
          durationMs: 0
        }
      }

      yield {
        callId: '', toolId: MEMORY_QUERY_TOOL_ID,
        status: 'progress' as const, elapsedMs: 0,
        statusText: queries.join(' | ')
      }

      const includeSourceMessages = Boolean(input.arguments.includeSourceMessages)
      const expandRelated = Boolean(input.arguments.expandRelated)
      const limitRaw = Number(input.arguments.limit ?? 10)
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(25, Math.floor(limitRaw))) : 10
      const includeArchived = Boolean(input.arguments.includeArchived)
      const factType = typeof input.arguments.factType === 'string' ? input.arguments.factType : undefined
      const entityType = typeof input.arguments.entityType === 'string'
        ? (input.arguments.entityType as never)
        : undefined

      const allHits = await Promise.all(
        queries.map((q) =>
          memory.queryFacts({ query: q, limit, includeArchived, factType, entityType })
        )
      )

      const merged = deduplicateHits(allHits.flat())
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)

      let relatedFacts: typeof merged = []
      if (expandRelated && merged.length > 0) {
        const entityIds = new Set<string>()
        for (const hit of merged) {
          for (const ref of hit.fact.entityRefs) entityIds.add(ref.entityId)
        }
        const seenFactIds = new Set(merged.map((h) => h.fact.factId))
        const related = await memory.getFactsByEntityIds([...entityIds], { includeArchived })
        relatedFacts = related
          .filter((f) => !seenFactIds.has(f.factId))
          .map((f) => ({ score: 0, fact: f }))
      }

      const allResults = [...merged, ...relatedFacts]

      yield {
        callId: '', toolId: MEMORY_QUERY_TOOL_ID,
        status: 'progress' as const, elapsedMs: 0,
        statusText: `${merged.length} facts` + (relatedFacts.length > 0 ? ` + ${relatedFacts.length} related` : '')
      }

      const output = await Promise.all(
        allResults.map(async (hit, i) => {
          const isRelated = i >= merged.length
          const base = {
            factId: hit.fact.factId,
            statement: hit.fact.statement,
            factType: hit.fact.factType,
            confidence: hit.fact.confidence,
            priority: hit.fact.priority,
            entityRefs: hit.fact.entityRefs,
            score: hit.score,
            ...(isRelated ? { source: 'related' as const } : {})
          }
          if (!includeSourceMessages) return base
          const sourceMessages = await Promise.all(
            hit.fact.sourceMessageIds.map(async (source) => {
              const message = await memory.getMessageById(source.messageId)
              if (!message) {
                return { messageId: source.messageId, chatId: source.chatId, missing: true }
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

function deduplicateHits(hits: FactSearchHit[]): FactSearchHit[] {
  const best = new Map<string, FactSearchHit>()
  for (const hit of hits) {
    const existing = best.get(hit.fact.factId)
    if (!existing || hit.score > existing.score) {
      best.set(hit.fact.factId, hit)
    }
  }
  return [...best.values()]
}
