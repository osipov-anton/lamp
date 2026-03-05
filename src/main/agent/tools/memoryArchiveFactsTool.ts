import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolInput,
  ToolProgressEvent,
  ToolResult
} from '../runtime/types'
import type { MemoryGraphPort } from '../../storage/ports/MemoryGraphPort'

export const MEMORY_ARCHIVE_FACTS_TOOL_ID = 'memory_archive_facts'

export function createMemoryArchiveFactsTool(memory: MemoryGraphPort): ToolDefinition {
  return {
    id: MEMORY_ARCHIVE_FACTS_TOOL_ID,
    version: '1.0.0',
    name: MEMORY_ARCHIVE_FACTS_TOOL_ID,
    description: 'Archive low-value or superseded facts.',
    inputSchema: {
      type: 'object',
      properties: {
        factIds: { type: 'array', items: { type: 'string' } },
        reason: { type: 'string' }
      },
      required: ['factIds', 'reason']
    },
    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      const factIds = Array.isArray(input.arguments.factIds)
        ? input.arguments.factIds.map((id) => String(id))
        : []
      const reason = String(input.arguments.reason ?? 'archive')
      const archived = await memory.archiveFacts(factIds, reason)
      return {
        callId: '',
        toolId: MEMORY_ARCHIVE_FACTS_TOOL_ID,
        success: true,
        content: [{ type: 'text', text: `Archived ${archived} fact(s)` }],
        durationMs: 0
      }
    }
  }
}
