import type {
  ToolDefinition,
  ToolInput,
  ToolExecutionContext,
  ToolProgressEvent,
  ToolResult
} from '../runtime/types'
import type { SupervisorRouter } from '../orchestrator/SupervisorRouter'

export const INVOKE_AGENT_TOOL_ID = 'invoke_agent'

export function createInvokeAgentTool(router: SupervisorRouter): ToolDefinition {
  return {
    id: INVOKE_AGENT_TOOL_ID,
    version: '1.0.0',
    name: 'invoke_agent',
    description: 'Invoke a child agent to perform a subtask and return its result.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description: 'ID of the child agent to invoke'
        },
        task: {
          type: 'string',
          description: 'Task description / prompt for the child agent'
        }
      },
      required: ['agentId', 'task']
    },

    async *execute(
      input: ToolInput,
      context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      const agentId = input.arguments.agentId as string
      const task = input.arguments.task as string
      const startTime = Date.now()

      yield {
        callId: '',
        toolId: INVOKE_AGENT_TOOL_ID,
        status: 'started',
        statusText: `Invoking agent "${agentId}"`,
        elapsedMs: 0
      }

      try {
        const runContext = router.getRunContextForRun(context.runId)
        const result = await router.executeChildRun({
          agentId,
          task,
          parentRunId: context.runId,
          chatId: runContext?.chatId ?? '',
          threadId: runContext?.threadId ?? '',
          signal: context.signal
        })

        yield {
          callId: '',
          toolId: INVOKE_AGENT_TOOL_ID,
          status: 'progress',
          statusText: 'Child agent completed',
          percent: 100,
          elapsedMs: Date.now() - startTime
        }

        return {
          callId: '',
          toolId: INVOKE_AGENT_TOOL_ID,
          success: true,
          content: [{ type: 'text', text: result }],
          durationMs: Date.now() - startTime
        }
      } catch (err) {
        return {
          callId: '',
          toolId: INVOKE_AGENT_TOOL_ID,
          success: false,
          content: [],
          error: err instanceof Error ? err.message : 'Child agent failed',
          durationMs: Date.now() - startTime
        }
      }
    }
  }
}
