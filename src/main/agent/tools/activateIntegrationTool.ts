import type {
  ToolDefinition,
  ToolInput,
  ToolExecutionContext,
  ToolProgressEvent,
  ToolResult
} from '../runtime/types'
import type { GeneratedIntegrationService } from '../generated/GeneratedIntegrationService'
import type { GlobalToolCatalog } from './GlobalToolCatalog'
import type { SupervisorRouter } from '../orchestrator/SupervisorRouter'
import type { GeneratedToolManifest } from '../generated/types'

export const ACTIVATE_INTEGRATION_TOOL_ID = 'activate_integration'

interface ActivateIntegrationDeps {
  service: GeneratedIntegrationService
  catalog: GlobalToolCatalog
  router: SupervisorRouter
  notify: (manifest: GeneratedToolManifest) => void
}

export function createActivateIntegrationTool(
  deps: ActivateIntegrationDeps
): ToolDefinition {
  return {
    id: ACTIVATE_INTEGRATION_TOOL_ID,
    version: '1.0.0',
    name: 'activate_integration',
    description:
      'Activate or reload a generated integration after code and manifest.json have been written or modified. ' +
      'Installs dependencies, registers tools in the catalog, and notifies the user. ' +
      'If the integration was already active, old tools are unregistered and replaced with the new ones from the manifest. ' +
      'If the integration requires env vars that are not yet set, it will be marked as pending_approval ' +
      'and the user will see an approval dialog to fill in credentials.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Integration ID (directory name under generated-integrations/)'
        }
      },
      required: ['id']
    },

    async *execute(
      input: ToolInput,
      _context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      const id = input.arguments.id as string
      const startTime = Date.now()

      yield {
        callId: '',
        toolId: ACTIVATE_INTEGRATION_TOOL_ID,
        status: 'started',
        statusText: `Activating integration: ${id}`,
        elapsedMs: 0
      }

      const manifest = deps.service.getManifest(id)
      if (!manifest) {
        return {
          callId: '',
          toolId: ACTIVATE_INTEGRATION_TOOL_ID,
          success: false,
          content: [],
          error: `Integration "${id}" not found. Make sure manifest.json exists in generated-integrations/${id}/`,
          durationMs: Date.now() - startTime
        }
      }

      const hasUnfilledEnvVars = manifest.envVars.some(
        (v) => v.required && !manifest.envValues[v.name]
      )

      if (hasUnfilledEnvVars) {
        manifest.status = 'pending_approval'
        deps.service.updateManifest(manifest)
        deps.notify(manifest)

        const envNames = manifest.envVars.filter((v) => v.required).map((v) => v.name).join(', ')
        return {
          callId: '',
          toolId: ACTIVATE_INTEGRATION_TOOL_ID,
          success: true,
          content: [{
            type: 'text',
            text:
              `Integration "${manifest.name}" requires credentials: ${envNames}\n` +
              `Status set to pending_approval. The user will see an approval dialog to provide the values.\n` +
              `Tools: ${manifest.tools.map((t) => t.name).join(', ')}`
          }],
          durationMs: Date.now() - startTime
        }
      }

      yield {
        callId: '',
        toolId: ACTIVATE_INTEGRATION_TOOL_ID,
        status: 'progress',
        statusText: 'Installing dependencies...',
        phase: 'install',
        elapsedMs: Date.now() - startTime
      }

      const installResult = await deps.service.installDependencies(id)
      if (!installResult.success) {
        return {
          callId: '',
          toolId: ACTIVATE_INTEGRATION_TOOL_ID,
          success: false,
          content: [],
          error: `Dependency installation failed: ${installResult.error}`,
          durationMs: Date.now() - startTime
        }
      }

      const readyManifest = deps.service.getManifest(id)!

      const mainAgent = deps.router.getAgent('main')
      if (mainAgent) {
        const prefix = `${id}_`
        const oldToolIds = mainAgent.allowedTools.filter((t) => t.startsWith(prefix))
        for (const oldId of oldToolIds) {
          deps.catalog.unregister(oldId)
        }
        mainAgent.allowedTools = mainAgent.allowedTools.filter((t) => !t.startsWith(prefix))
      }

      const tools = deps.service.createToolDefinitions(readyManifest)
      const toolIds: string[] = []

      for (const tool of tools) {
        deps.catalog.register(tool)
        toolIds.push(tool.id)
      }

      if (mainAgent) {
        for (const toolId of toolIds) {
          if (!mainAgent.allowedTools.includes(toolId)) {
            mainAgent.allowedTools.push(toolId)
          }
        }
      }

      deps.notify(readyManifest)

      return {
        callId: '',
        toolId: ACTIVATE_INTEGRATION_TOOL_ID,
        success: true,
        content: [{
          type: 'text',
          text:
            `Integration "${readyManifest.name}" activated successfully.\n` +
            `Status: ready\n` +
            `Registered tools: ${toolIds.join(', ')}\n` +
            `These tools are now available to the main agent.`
        }],
        durationMs: Date.now() - startTime
      }
    }
  }
}
