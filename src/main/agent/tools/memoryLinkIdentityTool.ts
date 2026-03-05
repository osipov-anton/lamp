import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolInput,
  ToolProgressEvent,
  ToolResult
} from '../runtime/types'
import type { MemoryGraphPort } from '../../storage/ports/MemoryGraphPort'

export const MEMORY_LINK_IDENTITY_TOOL_ID = 'memory_link_identity'

export function createMemoryLinkIdentityTool(memory: MemoryGraphPort): ToolDefinition {
  return {
    id: MEMORY_LINK_IDENTITY_TOOL_ID,
    version: '1.0.0',
    name: MEMORY_LINK_IDENTITY_TOOL_ID,
    description: 'Link channel identity to a memory entity.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        channelType: {
          type: 'string',
          enum: ['telegram', 'email', 'whatsapp', 'local_chat']
        },
        externalId: { type: 'string' },
        displayName: { type: 'string' },
        confidence: { type: 'number' }
      },
      required: ['entityId', 'channelType', 'externalId', 'displayName', 'confidence']
    },
    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      const linked = await memory.linkIdentity({
        entityId: String(input.arguments.entityId ?? ''),
        channelType: String(input.arguments.channelType ?? 'local_chat') as never,
        externalId: String(input.arguments.externalId ?? ''),
        displayName: String(input.arguments.displayName ?? ''),
        confidence: Number(input.arguments.confidence ?? 0.5)
      })
      return {
        callId: '',
        toolId: MEMORY_LINK_IDENTITY_TOOL_ID,
        success: true,
        content: [{ type: 'text', text: JSON.stringify(linked, null, 2) }],
        durationMs: 0
      }
    }
  }
}
