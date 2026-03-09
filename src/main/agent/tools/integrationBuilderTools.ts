import type {
  ToolDefinition,
  ToolInput,
  ToolExecutionContext,
  ToolProgressEvent,
  ToolResult
} from '../runtime/types'
import type { GeneratedIntegrationService } from '../generated/GeneratedIntegrationService'
import type { SupervisorRouter } from '../orchestrator/SupervisorRouter'

export const RUN_DEVELOPER_TOOL_ID = 'run_developer'
export const LIST_INTEGRATIONS_TOOL_ID = 'list_integrations'
export const DELETE_INTEGRATION_TOOL_ID = 'delete_integration'

export function createRunDeveloperTool(
  router: SupervisorRouter
): ToolDefinition {
  return {
    id: RUN_DEVELOPER_TOOL_ID,
    version: '1.0.0',
    name: 'run_developer',
    description:
      'Delegate a coding task to the developer agent. ' +
      'Describe what to build, modify, or fix. ' +
      'The developer has file system access, shell, and web search. ' +
      'Include all necessary context and conventions in the task description.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            'Detailed task description. Include what to create/modify, file paths, ' +
            'conventions to follow, and how to test the result.'
        }
      },
      required: ['task']
    },

    async *execute(
      input: ToolInput,
      context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      const task = input.arguments.task as string
      const startTime = Date.now()

      yield {
        callId: '',
        toolId: RUN_DEVELOPER_TOOL_ID,
        status: 'started',
        statusText: 'Starting developer...',
        phase: 'delegating',
        elapsedMs: 0
      }

      try {
        const runContext = router.getRunContextForRun(context.runId)
        const result = await router.executeChildRun({
          agentId: 'developer',
          task,
          parentRunId: context.runId,
          chatId: runContext?.chatId ?? '',
          threadId: runContext?.threadId ?? '',
          signal: context.signal
        })

        return {
          callId: '',
          toolId: RUN_DEVELOPER_TOOL_ID,
          success: true,
          content: [{ type: 'text', text: result }],
          durationMs: Date.now() - startTime
        }
      } catch (err) {
        return {
          callId: '',
          toolId: RUN_DEVELOPER_TOOL_ID,
          success: false,
          content: [],
          error: err instanceof Error ? err.message : 'Developer task failed',
          durationMs: Date.now() - startTime
        }
      }
    }
  }
}

export function createListIntegrationsTool(
  service: GeneratedIntegrationService
): ToolDefinition {
  return {
    id: LIST_INTEGRATIONS_TOOL_ID,
    version: '1.0.0',
    name: 'list_integrations',
    description: 'List all generated integrations and their status. Use this to check what integrations are available before creating new ones.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },

    async *execute(
      _input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      const manifests = service.listManifests()

      if (manifests.length === 0) {
        return {
          callId: '',
          toolId: LIST_INTEGRATIONS_TOOL_ID,
          success: true,
          content: [{ type: 'text', text: 'No generated integrations found.' }],
          durationMs: 0
        }
      }

      const lines = manifests.map((m) => {
        const tools = m.tools.map((t) => t.name).join(', ')
        return `- ${m.name} (${m.id}): status=${m.status}, tools=[${tools}]`
      })

      return {
        callId: '',
        toolId: LIST_INTEGRATIONS_TOOL_ID,
        success: true,
        content: [{ type: 'text', text: `Generated integrations:\n${lines.join('\n')}` }],
        durationMs: 0
      }
    }
  }
}

export function createDeleteIntegrationTool(
  service: GeneratedIntegrationService
): ToolDefinition {
  return {
    id: DELETE_INTEGRATION_TOOL_ID,
    version: '1.0.0',
    name: 'delete_integration',
    description: 'Delete a generated integration and all its tools.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Integration ID to delete'
        }
      },
      required: ['id']
    },

    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      const id = input.arguments.id as string
      service.deleteIntegration(id)

      return {
        callId: '',
        toolId: DELETE_INTEGRATION_TOOL_ID,
        success: true,
        content: [{ type: 'text', text: `Integration "${id}" deleted.` }],
        durationMs: 0
      }
    }
  }
}
