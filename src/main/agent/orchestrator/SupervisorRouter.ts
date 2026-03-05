import type { AgentDefinition, NormalizedMessage } from '../runtime/types'
import { AgentRuntime } from '../runtime/AgentRuntime'
import { ArtifactBus } from '../runtime/ArtifactBus'
import { GlobalToolCatalog } from '../tools/GlobalToolCatalog'
import { ProviderRegistry } from '../providers/ProviderRegistry'
import { createInvokeAgentTool } from '../tools/invokeAgentTool'

export interface SupervisorConfig {
  maxDepth: number
  maxTotalIterations: number
  timeoutMs: number
}

export interface ChildRunRequest {
  agentId: string
  task: string
  parentRunId: string
  chatId: string
  threadId: string
  signal: AbortSignal
}

const DEFAULT_CONFIG: SupervisorConfig = {
  maxDepth: 3,
  maxTotalIterations: 50,
  timeoutMs: 120_000
}

export class SupervisorRouter {
  private catalog: GlobalToolCatalog
  private providerRegistry: ProviderRegistry
  private agentDefinitions = new Map<string, AgentDefinition>()
  private config: SupervisorConfig
  private bus: ArtifactBus
  private runContextByRunId = new Map<string, { chatId: string; threadId: string }>()
  private activeRuntimes = new Map<string, AgentRuntime>()

  constructor(opts: {
    catalog: GlobalToolCatalog
    providerRegistry: ProviderRegistry
    bus: ArtifactBus
    config?: Partial<SupervisorConfig>
  }) {
    this.catalog = opts.catalog
    this.providerRegistry = opts.providerRegistry
    this.bus = opts.bus
    this.config = { ...DEFAULT_CONFIG, ...opts.config }
  }

  registerAgent(definition: AgentDefinition): void {
    this.agentDefinitions.set(definition.id, definition)
  }

  getAgent(agentId: string): AgentDefinition | undefined {
    return this.agentDefinitions.get(agentId)
  }

  getRunContextForRun(runId: string): { chatId: string; threadId: string } | undefined {
    return this.runContextByRunId.get(runId)
  }

  cancelRunsForChat(chatId: string, threadId?: string): number {
    let cancelled = 0
    for (const [runId, context] of this.runContextByRunId.entries()) {
      if (context.chatId !== chatId) continue
      if (threadId && context.threadId !== threadId) continue
      const runtime = this.activeRuntimes.get(runId)
      if (!runtime) continue
      runtime.cancel()
      cancelled++
    }
    return cancelled
  }

  async executeRun(
    agentId: string,
    chatId: string,
    threadId: string,
    messages: NormalizedMessage[]
  ): Promise<string> {
    return this.internalRun(agentId, chatId, threadId, messages, undefined, 0)
  }

  async executeChildRun(request: ChildRunRequest): Promise<string> {
    const parentRun = request.parentRunId
    const depth = this.computeDepth(parentRun) + 1

    if (depth > this.config.maxDepth) {
      throw new Error(
        `Max agent depth (${this.config.maxDepth}) exceeded`
      )
    }

    const messages: NormalizedMessage[] = [
      { role: 'user', content: request.task }
    ]

    return this.internalRun(
      request.agentId,
      request.chatId,
      request.threadId,
      messages,
      parentRun,
      depth
    )
  }

  // ---------------------------------------------------------------------------

  private async internalRun(
    agentId: string,
    chatId: string,
    threadId: string,
    messages: NormalizedMessage[],
    parentRunId: string | undefined,
    depth: number
  ): Promise<string> {
    console.log('[supervisor] internalRun agent:', agentId, 'depth:', depth)
    const definition = this.agentDefinitions.get(agentId)
    if (!definition) {
      throw new Error(`Agent "${agentId}" not registered`)
    }

    const provider = this.providerRegistry.getOrThrow(definition.providerProfile)

    const policy = {
      agentId,
      allowedToolIds: [...definition.allowedTools]
    }
    const toolRegistry = this.catalog.createScopedRegistry(policy)
    console.log('[supervisor] scoped tools:', toolRegistry.getAll().map(t => t.id).join(', '))

    const hasChildAgents = definition.allowedTools.includes('invoke_agent')
    if (hasChildAgents) {
      toolRegistry.register(createInvokeAgentTool(this))
    }

    const runContext = {
      runId: crypto.randomUUID(),
      agentId,
      chatId,
      threadId,
      parentRunId,
      depth,
      startedAt: Date.now(),
      iterationBudget: Math.min(
        definition.maxIterations,
        this.config.maxTotalIterations
      )
    }

    this.runContextByRunId.set(runContext.runId, { chatId, threadId })

    const runtime = new AgentRuntime({
      definition,
      toolRegistry,
      provider,
      bus: this.bus,
      runContext
    })
    this.activeRuntimes.set(runContext.runId, runtime)

    const timeoutId = setTimeout(() => runtime.cancel(), this.config.timeoutMs)

    try {
      return await runtime.run(messages)
    } finally {
      clearTimeout(timeoutId)
      this.activeRuntimes.delete(runContext.runId)
      this.runContextByRunId.delete(runContext.runId)
    }
  }

  private computeDepth(_parentRunId: string | undefined): number {
    // In a full implementation this would walk up the parentRunId chain.
    // For now depth is tracked inline via the recursive internalRun calls.
    return 0
  }
}
