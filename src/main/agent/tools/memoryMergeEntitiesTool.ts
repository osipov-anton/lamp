import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolInput,
  ToolProgressEvent,
  ToolResult
} from '../runtime/types'
import type { MemoryGraphPort } from '../../storage/ports/MemoryGraphPort'

export const MEMORY_MERGE_ENTITIES_TOOL_ID = 'memory_merge_entities'

export function createMemoryMergeEntitiesTool(memory: MemoryGraphPort): ToolDefinition {
  return {
    id: MEMORY_MERGE_ENTITIES_TOOL_ID,
    version: '1.0.0',
    name: MEMORY_MERGE_ENTITIES_TOOL_ID,
    description: 'Merge duplicate entities into one canonical entity.',
    inputSchema: {
      type: 'object',
      properties: {
        keepEntityId: { type: 'string' },
        mergeEntityId: { type: 'string' },
        reason: { type: 'string' }
      },
      required: ['keepEntityId', 'mergeEntityId', 'reason']
    },
    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      const keepEntityId = String(input.arguments.keepEntityId ?? '')
      const mergeEntityId = String(input.arguments.mergeEntityId ?? '')
      const reason = String(input.arguments.reason ?? 'merge')
      await memory.mergeEntities(keepEntityId, mergeEntityId, reason)
      return {
        callId: '',
        toolId: MEMORY_MERGE_ENTITIES_TOOL_ID,
        success: true,
        content: [{ type: 'text', text: `Merged ${mergeEntityId} into ${keepEntityId}` }],
        durationMs: 0
      }
    }
  }
}
