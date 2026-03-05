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
import { SupervisorRouter } from './orchestrator/SupervisorRouter'
import type { AgentDefinition } from './runtime/types'
import { getChats, getSettings } from '../store'
import { OramaMemoryGraphAdapter } from '../storage/adapters/orama/OramaMemoryGraphAdapter'
import type { MemoryGraphPort } from '../storage/ports/MemoryGraphPort'
import { FactExtractionService } from './memory/FactExtractionService'
import { PromptContextComposer } from './memory/PromptContextComposer'
import { MemoryGraphService } from './memory/MemoryGraphService'
import { getTelegramService } from '../telegram'

export interface AgentSystem {
  bus: ArtifactBus
  providerRegistry: ProviderRegistry
  catalog: GlobalToolCatalog
  router: SupervisorRouter
  openRouterProvider: OpenRouterProviderAdapter
  memoryGraph: MemoryGraphPort
  factExtraction: FactExtractionService
  promptComposer: PromptContextComposer
  memoryGraphService: MemoryGraphService
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
      'You are Lamp, a helpful AI assistant. Be concise and accurate. Use web_search for real-time information, memory_query for user/fact memory retrieval, and search_messages for raw chat history lookup.',
    modelConfig: { model },
    maxIterations: 10,
    allowedTools: ['web_search', 'search_messages', 'memory_query', ...ALL_TELEGRAM_TOOL_IDS],
    providerProfile: 'openrouter'
  }
}

function createMemoryCuratorAgent(): AgentDefinition {
  let model = 'openai/gpt-4o-mini'
  try {
    model = getSettings().model || model
  } catch {
    // store not ready yet, use default
  }

  return {
    id: 'memory_curator',
    name: 'Memory Curator',
    systemPrompt:
      'You are a memory curator agent. Maintain memory quality: extract durable facts, merge duplicates, archive stale facts, and preserve provenance to source messages.',
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
    () => getSettings().proxyUrl
  )
  const promptComposer = new PromptContextComposer(memoryGraph)
  const memoryGraphService = new MemoryGraphService(memoryGraph)

  void memoryGraph.rebuildMessages(
    getChats().flatMap((chat) =>
      chat.threads.flatMap((thread) =>
        thread.messages.map((message) => ({
          chatId: chat.id,
          threadId: thread.id,
          chatTitle: chat.title,
          messageId: message.id,
          role: message.role,
          content: message.content,
          senderName: message.role === 'assistant' ? 'assistant' : 'user',
          channelType: 'local_chat',
          channelExternalId: '',
          timestamp: message.timestamp
        }))
      )
    )
  ).catch((error) => {
    console.error('[memory] failed to rebuild message index:', error)
  })

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
    promptComposer,
    memoryGraphService
  }
}
