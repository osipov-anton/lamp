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

export interface AgentSystem {
  bus: ArtifactBus
  providerRegistry: ProviderRegistry
  catalog: GlobalToolCatalog
  router: SupervisorRouter
  openRouterProvider: OpenRouterProviderAdapter
  memoryGraph: MemoryGraphPort
  factExtraction: FactExtractionService
  memoryGraphService: MemoryGraphService
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
      '- memory_query: search stored facts and knowledge about the user (ALWAYS use proactively with multiple queries)\n' +
      '- web_search: look up real-time information from the internet\n' +
      '- search_messages: search raw chat history for past conversations',
    modelConfig: { model },
    maxIterations: 10,
    allowedTools: ['web_search', 'search_messages', 'memory_query', ...ALL_TELEGRAM_TOOL_IDS, ...ALL_GOOGLE_TOOL_IDS],
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
    () => getSettings().memoryModel || getSettings().model || 'openai/gpt-4o-mini'
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

  const router = new SupervisorRouter({
    catalog,
    providerRegistry,
    bus
  })

  router.registerAgent(createDefaultAgent())
  router.registerAgent(createMemoryCuratorAgent())

  return {
    bus,
    providerRegistry,
    catalog,
    router,
    openRouterProvider,
    memoryGraph,
    factExtraction,
    memoryGraphService
  }
}

function formatPromptDate(value: Date): string {
  return value.toISOString()
}
