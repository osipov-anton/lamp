import { ArtifactBus } from './runtime/ArtifactBus'
import { ProviderRegistry } from './providers/ProviderRegistry'
import { OpenRouterProviderAdapter } from './providers/openrouter/OpenRouterProviderAdapter'
import { GlobalToolCatalog } from './tools/GlobalToolCatalog'
import { createWebSearchTool } from './tools/webSearchTool'
import { createSearchMessagesTool } from './tools/searchMessagesTool'
import { createMemoryQueryTool } from './tools/memoryQueryTool'
import { createMemoryUpsertFactTool } from './tools/memoryUpsertFactTool'
import { createMemoryMergeEntitiesTool } from './tools/memoryMergeEntitiesTool'
import { createMemoryArchiveFactsTool } from './tools/memoryArchiveFactsTool'
import { createMemoryLinkIdentityTool } from './tools/memoryLinkIdentityTool'
import {
  createTelegramListChatsTool,
  createTelegramListContactsTool,
  createTelegramReadMessagesTool,
  createTelegramSendMessageTool,
  createTelegramSearchMessagesTool,
  ALL_TELEGRAM_TOOL_IDS
} from './tools/telegramTools'
import {
  createGmailListEmailsTool,
  createGmailReadEmailTool,
  createGmailSendEmailTool,
  createGmailSearchEmailsTool,
  createGcalListEventsTool,
  createGcalCreateEventTool,
  createGcalGetEventTool,
  ALL_GOOGLE_TOOL_IDS
} from './tools/googleTools'
import { SupervisorRouter } from './orchestrator/SupervisorRouter'
import type { AgentDefinition } from './runtime/types'
import { getSettings } from '../store'
import { OramaMemoryGraphAdapter } from '../storage/adapters/orama/OramaMemoryGraphAdapter'
import type { MemoryGraphPort } from '../storage/ports/MemoryGraphPort'
import { FactExtractionService } from './memory/FactExtractionService'
import { MemoryGraphService } from './memory/MemoryGraphService'
import { getTelegramService } from '../telegram'
import { getGoogleService } from '../google'
import {
  createRunDeveloperTool,
  createListIntegrationsTool,
  createDeleteIntegrationTool
} from './tools/integrationBuilderTools'
import { getGeneratedIntegrationService } from './generated/GeneratedIntegrationService'
import {
  createReadFileTool,
  createWriteFileTool,
  createApplyPatchTool,
  createListDirTool,
  createSearchFilesTool,
  createDeleteFileTool,
  createRunCommandTool,
  ALL_DEV_TOOL_IDS
} from './tools/devTools'
import {
  createActivateIntegrationTool,
  ACTIVATE_INTEGRATION_TOOL_ID
} from './tools/activateIntegrationTool'
import { notifyIntegrationChanged } from '../ipc/integrations'

export interface AgentSystem {
  bus: ArtifactBus
  providerRegistry: ProviderRegistry
  catalog: GlobalToolCatalog
  router: SupervisorRouter
  openRouterProvider: OpenRouterProviderAdapter
  memoryGraph: MemoryGraphPort
  factExtraction: FactExtractionService
  memoryGraphService: MemoryGraphService
  integrationService: ReturnType<typeof getGeneratedIntegrationService>
}

export function buildMemoryCuratorSystemPrompt(now: Date = new Date()): string {
  return (
    'You are a memory curator agent. You are the ONLY way facts get created in the memory system.\n\n' +
    `Current date: ${formatPromptDate(now)}\n\n` +
    'YOUR WORKFLOW:\n' +
    '1. Use search_messages to find recent conversations worth remembering\n' +
    '2. Identify durable facts (preferences, relationships, plans, biographical info)\n' +
    '3. Before creating any fact, ALWAYS use memory_query first to check if a similar fact already exists\n' +
    '4. If memory_upsert_fact returns a WARNING about similar facts:\n' +
    '   - If it IS a duplicate: skip it, or update the existing fact by passing its factId\n' +
    '   - If it is genuinely different: call again with force=true\n' +
    '5. Use memory_merge_entities to merge duplicate entities\n' +
    '6. Use memory_archive_facts to archive stale or outdated facts\n\n' +
    'RULES:\n' +
    '- Only extract facts that are useful for future conversations\n' +
    '- Keep fact statements concise and clear\n' +
    '- Use the current date and message timestamps to judge recency, deadlines, and whether a fact may be stale\n' +
    '- Always preserve provenance (sourceMessageIds)\n' +
    '- Prefer updating existing facts over creating new duplicates'
  )
}

function createDefaultAgent(): AgentDefinition {
  let model = 'openai/gpt-4o-mini'
  try {
    model = getSettings().model || model
  } catch {
    // store not ready yet, use default
  }

  return {
    id: 'main',
    name: 'Lamp Assistant',
    systemPrompt:
      'You are Lamp, a helpful AI assistant. Be concise and accurate.\n\n' +
      'MEMORY: At the start of every conversation turn, ALWAYS call memory_query to recall facts about the user and topic.\n' +
      'How to use memory_query effectively:\n' +
      '- Pass queries[] with 2-4 SHORT diverse search queries (3-5 words each)\n' +
      '- Cover different angles: name variants, transliterations (e.g. "Елена" and "Elena"), related topics\n' +
      '- Set expandRelated=true when asking about a person or entity to also get connected facts\n' +
      '- Example: queries=["Elena Chasova", "Елена мама пользователя", "user mother"] expandRelated=true\n' +
      'Do not skip this step.\n\n' +
      'TOOLS:\n' +
      '- memory_query: search stored facts and knowledge about the user (ALWAYS use proactively)\n' +
      '- web_search: look up real-time information from the internet\n' +
      '- search_messages: search raw chat history for past conversations\n' +
      '- read_file / list_dir: inspect files in lamp-data/ (e.g. generated-integrations/)\n' +
      '- run_developer: delegate a coding task to the developer agent (file system, shell, web search)\n' +
      '- list_integrations: check what integrations are installed\n' +
      '- delete_integration: remove an integration\n' +
      '- activate_integration: enable a built integration by its id\n\n' +
      'INTEGRATIONS:\n' +
      'You CAN build integrations for ANY external service. You are NOT limited to pre-built tools.\n' +
      'NEVER say you cannot connect to a service.\n\n' +
      'Integration workflow:\n' +
      '1. Use list_dir("generated-integrations") and read_file to inspect existing integrations\n' +
      '2. Use run_developer(task) to build or modify an integration — include ALL conventions below in the task\n' +
      '3. IMPORTANT: After run_developer finishes, you MUST call activate_integration(id) to register the tools and prompt the user for API keys. Do NOT skip this step.\n\n' +
      'When calling run_developer for an integration, include these conventions in the task:\n' +
      '- Directory: generated-integrations/{id}/\n' +
      '- Files: index.ts (or main.py), manifest.json, package.json (or requirements.txt)\n' +
      '- Script pattern (TS): actions record, parse process.argv[2] as JSON {action, arguments}, call action fn, print JSON {success,data} or {success:false,error}\n' +
      '- Script pattern (Python): actions dict, parse sys.argv[1], print JSON result\n' +
      '- manifest.json: {id, name, description, language, entrypoint, dependencies, envVars[{name,description,required}], tools[{name,action,description,inputSchema}], status:"pending_approval", envValues:{}, codeHash:"", createdAt:0, updatedAt:0}\n' +
      '- Install deps: run_command("npm install", "generated-integrations/{id}/")\n' +
      '- Test before finishing: run_command(\'npx tsx index.ts \'\'{"action":"...","arguments":{}}\'\'\')\n' +
      '- Tool names must be prefixed with integration id (e.g. stripe_list_customers)\n' +
      '- Use web_search to look up API docs if needed\n' +
      '- At the end of the task, clearly report the integration id (directory name)',
    modelConfig: { model },
    maxIterations: 15,
    allowedTools: [
      'web_search', 'search_messages', 'memory_query',
      'read_file', 'list_dir',
      'run_developer',
      'list_integrations', 'delete_integration',
      ACTIVATE_INTEGRATION_TOOL_ID,
      ...ALL_TELEGRAM_TOOL_IDS,
      ...ALL_GOOGLE_TOOL_IDS
    ],
    providerProfile: 'openrouter'
  }
}

function createMemoryCuratorAgent(): AgentDefinition {
  let model = 'openai/gpt-4o-mini'
  try {
    model = getSettings().memoryModel || getSettings().model || model
  } catch {
    // store not ready yet, use default
  }

  return {
    id: 'memory_curator',
    name: 'Memory Curator',
    systemPrompt: buildMemoryCuratorSystemPrompt(),
    modelConfig: { model, temperature: 0.1 },
    maxIterations: 8,
    allowedTools: [
      'web_search',
      'search_messages',
      'memory_query',
      'memory_upsert_fact',
      'memory_merge_entities',
      'memory_archive_facts',
      'memory_link_identity'
    ],
    providerProfile: 'openrouter'
  }
}

function createDeveloperAgent(): AgentDefinition {
  let model = 'openai/gpt-4o-mini'
  try {
    model = getSettings().model || model
  } catch {
    // store not ready yet, use default
  }

  return {
    id: 'developer',
    name: 'Developer',
    systemPrompt:
      'You are a developer agent. You receive coding tasks and execute them using file system tools and a shell.\n\n' +
      'All file paths are relative to lamp-data/.\n\n' +
      'TOOLS:\n' +
      '- read_file: read file contents (supports offset/limit)\n' +
      '- write_file: create or overwrite a file\n' +
      '- apply_patch: replace a unique string in a file\n' +
      '- list_dir: list directory contents\n' +
      '- search_files: regex search across files\n' +
      '- delete_file: delete a file or directory\n' +
      '- run_command: run a shell command with optional cwd and timeout\n' +
      '- web_search: look up documentation or API references\n\n' +
      'WORKFLOW:\n' +
      '1. Read the task description carefully — it contains all necessary context and conventions\n' +
      '2. Create or modify the required files\n' +
      '3. Install dependencies if needed (npm install, pip install, etc.)\n' +
      '4. Test your work with run_command\n' +
      '5. If tests fail, read the error, fix the code, and re-test\n' +
      '6. Report what you did when finished',
    modelConfig: { model },
    maxIterations: 20,
    allowedTools: [
      ...ALL_DEV_TOOL_IDS,
      'web_search'
    ],
    providerProfile: 'openrouter'
  }
}

export function bootstrapAgentSystem(): AgentSystem {
  const bus = new ArtifactBus()
  const initialSettings = getSettings()

  const openRouterProvider = new OpenRouterProviderAdapter({
    apiKey: initialSettings.openRouterApiKey || '',
    proxyUrl: initialSettings.proxyUrl || undefined
  })

  const providerRegistry = new ProviderRegistry()
  providerRegistry.register(openRouterProvider)

  const memoryGraph = new OramaMemoryGraphAdapter(async (text) => {
    const settings = getSettings()
    if (settings.openRouterApiKey) {
      openRouterProvider.updateApiKey(settings.openRouterApiKey)
    }
    openRouterProvider.updateProxyUrl(settings.proxyUrl)
    return openRouterProvider.embedText(text)
  })
  const factExtraction = new FactExtractionService(
    () => getSettings().openRouterApiKey,
    () => getSettings().proxyUrl,
    () =>
      getSettings().memoryModel || getSettings().model || 'anthropic/claude-sonnet-4.6'
  )
  const memoryGraphService = new MemoryGraphService(memoryGraph)

  const catalog = new GlobalToolCatalog()
  catalog.register(
    createWebSearchTool({
      getApiKey: () => getSettings().openRouterApiKey,
      getProxyUrl: () => getSettings().proxyUrl
    })
  )
  catalog.register(
    createSearchMessagesTool({
      memory: memoryGraph
    })
  )
  catalog.register(createMemoryQueryTool(memoryGraph))
  catalog.register(createMemoryUpsertFactTool(memoryGraph))
  catalog.register(createMemoryMergeEntitiesTool(memoryGraph))
  catalog.register(createMemoryArchiveFactsTool(memoryGraph))
  catalog.register(createMemoryLinkIdentityTool(memoryGraph))

  const telegramService = getTelegramService()
  catalog.register(createTelegramListChatsTool(telegramService))
  catalog.register(createTelegramListContactsTool(telegramService))
  catalog.register(createTelegramReadMessagesTool(telegramService))
  catalog.register(createTelegramSendMessageTool(telegramService))
  catalog.register(createTelegramSearchMessagesTool(telegramService))

  const googleService = getGoogleService()
  catalog.register(createGmailListEmailsTool(googleService))
  catalog.register(createGmailReadEmailTool(googleService))
  catalog.register(createGmailSendEmailTool(googleService))
  catalog.register(createGmailSearchEmailsTool(googleService))
  catalog.register(createGcalListEventsTool(googleService))
  catalog.register(createGcalCreateEventTool(googleService))
  catalog.register(createGcalGetEventTool(googleService))

  const integrationService = getGeneratedIntegrationService()
  catalog.register(createListIntegrationsTool(integrationService))
  catalog.register(createDeleteIntegrationTool(integrationService))

  catalog.register(createReadFileTool())
  catalog.register(createWriteFileTool())
  catalog.register(createApplyPatchTool())
  catalog.register(createListDirTool())
  catalog.register(createSearchFilesTool())
  catalog.register(createDeleteFileTool())
  catalog.register(createRunCommandTool())

  const router = new SupervisorRouter({
    catalog,
    providerRegistry,
    bus
  })

  catalog.register(createRunDeveloperTool(router))
  catalog.register(createActivateIntegrationTool({
    service: integrationService,
    catalog,
    router,
    notify: notifyIntegrationChanged
  }))

  router.registerAgent(createDefaultAgent())
  router.registerAgent(createMemoryCuratorAgent())
  router.registerAgent(createDeveloperAgent())

  return {
    bus,
    providerRegistry,
    catalog,
    router,
    openRouterProvider,
    memoryGraph,
    factExtraction,
    memoryGraphService,
    integrationService
  }
}

function formatPromptDate(value: Date): string {
  return value.toISOString()
}
