import type {
  AgentDefinition,
  AgentRuntimePhase,
  AgentRuntimeState,
  Artifact,
  ArtifactContent,
  NormalizedMessage,
  ProviderStreamEvent,
  RunContext,
  ToolCallRequest,
  ToolInput,
  ToolLifecycleEvent,
  ToolResult,
  ToolResultContent
} from './types'
import type { ModelProvider } from '../providers/ModelProvider'
import { ArtifactBus } from './ArtifactBus'
import { ToolRegistry } from './ToolRegistry'

export interface AgentRuntimeOptions {
  definition: AgentDefinition
  toolRegistry: ToolRegistry
  provider: ModelProvider
  bus: ArtifactBus
  runContext: RunContext
}

export class AgentRuntime {
  private state: AgentRuntimeState
  private definition: AgentDefinition
  private toolRegistry: ToolRegistry
  private provider: ModelProvider
  private bus: ArtifactBus
  private abortController: AbortController
  private stepCounter = 0

  constructor(opts: AgentRuntimeOptions) {
    this.definition = opts.definition
    this.toolRegistry = opts.toolRegistry
    this.provider = opts.provider
    this.bus = opts.bus
    this.abortController = new AbortController()

    this.state = {
      phase: 'init',
      runContext: opts.runContext,
      iteration: 0,
      artifacts: [],
      pendingToolCalls: []
    }
  }

  async run(messages: NormalizedMessage[]): Promise<string> {
    console.log('[runtime] run started, runId:', this.runId, 'agent:', this.definition.id)
    const conversationMessages: NormalizedMessage[] = [
      { role: 'system', content: this.definition.systemPrompt },
      ...messages
    ]

    let finalText = ''

    try {
      while (this.state.iteration < this.state.runContext.iterationBudget) {
        if (this.abortController.signal.aborted) {
          this.transition('cancelled')
          break
        }

        this.state.iteration++
        console.log('[runtime] iteration', this.state.iteration, '/', this.state.runContext.iterationBudget)
        this.transition('thinking')

        const { textContent, thinkingContent, toolCalls, stopReason } =
          await this.consumeStream(conversationMessages)

        console.log('[runtime] stream consumed — stopReason:', stopReason, 'text:', textContent.length, 'chars, toolCalls:', toolCalls.length)

        if (stopReason === 'cancelled' || this.abortController.signal.aborted) {
          finalText = textContent || finalText
          this.transition('cancelled')
          break
        }

        if (thinkingContent) {
          this.emitArtifact({
            type: 'thinking',
            text: thinkingContent
          })
        }

        if (stopReason === 'tool_use' && toolCalls.length > 0) {
          console.log('[runtime] tool_use detected:', toolCalls.map(tc => `${tc.toolId}(${JSON.stringify(tc.arguments)})`).join(', '))
          this.state.pendingToolCalls = toolCalls
          this.transition('tool_call')

          conversationMessages.push({
            role: 'assistant',
            content: textContent || null,
            toolCalls: toolCalls.map((tc) => ({
              callId: tc.callId,
              toolName: tc.toolId,
              arguments: JSON.stringify(tc.arguments)
            }))
          })

          this.transition('observing')
          console.log('[runtime] executing tool calls...')
          const results = await this.executeToolCalls(toolCalls)
          console.log('[runtime] tool calls done, results:', results.map(r => `${r.toolId}:${r.success ? 'ok' : 'err'}`).join(', '))

          for (const result of results) {
            for (const content of result.content) {
              if (content.type === 'text') {
                this.emitArtifact({
                  type: 'tool_output_text',
                  callId: result.callId,
                  toolId: result.toolId,
                  text: content.text
                })
              } else if (content.type === 'image') {
                this.emitArtifact({
                  type: 'tool_output_image',
                  callId: result.callId,
                  toolId: result.toolId,
                  mimeType: content.mimeType,
                  filePath: content.filePath,
                  alt: content.alt
                })
              }
            }

            conversationMessages.push({
              role: 'tool',
              toolCallId: result.callId,
              content: result.success
                ? result.content
                    .filter((c): c is ToolResultContent & { type: 'text' } => c.type === 'text')
                    .map((c) => c.text)
                    .join('\n')
                : `Error: ${result.error}`
            })
          }

          this.state.pendingToolCalls = []
          continue
        }

        finalText = textContent
        this.emitArtifact({ type: 'final', text: finalText })
        this.transition('completed')
        this.bus.emit({ kind: 'run_complete', runId: this.runId, finalText })
        return finalText
      }

      if (this.state.phase !== 'cancelled') {
        finalText = finalText || '(max iterations reached)'
        this.emitArtifact({ type: 'final', text: finalText })
        this.transition('completed')
        this.bus.emit({ kind: 'run_complete', runId: this.runId, finalText })
      }

      return finalText
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      this.emitArtifact({ type: 'error', message })
      this.transition('failed')
      this.state.error = message
      this.bus.emit({ kind: 'run_error', runId: this.runId, error: message })
      throw err
    }
  }

  cancel(): void {
    this.abortController.abort()
  }

  getState(): Readonly<AgentRuntimeState> {
    return this.state
  }

  get runId(): string {
    return this.state.runContext.runId
  }

  // ---------------------------------------------------------------------------

  private async consumeStream(messages: NormalizedMessage[]): Promise<{
    textContent: string
    thinkingContent: string
    toolCalls: ToolCallRequest[]
    stopReason: string
  }> {
    const stream = this.provider.streamResponse({
      model: this.definition.modelConfig.model,
      messages,
      tools: this.toolRegistry.getSchemas(),
      temperature: this.definition.modelConfig.temperature,
      maxTokens: this.definition.modelConfig.maxTokens,
      signal: this.abortController.signal
    })

    let textContent = ''
    let thinkingContent = ''
    let stopReason = 'end_turn'
    const toolCallsMap = new Map<
      string,
      { callId: string; toolName: string; argChunks: string[] }
    >()

    try {
      for await (const event of stream) {
        this.handleStreamEvent(event, toolCallsMap, (delta) => {
          textContent += delta
        }, (delta) => {
          thinkingContent += delta
        })

        if (event.type === 'done' && stopReason !== 'tool_use') {
          stopReason = event.stopReason
        }
        if (event.type === 'error') {
          throw new Error(event.error)
        }
      }
    } catch (err) {
      if (this.abortController.signal.aborted && isAbortError(err)) {
        stopReason = 'cancelled'
      } else {
        throw err
      }
    }

    const toolCalls: ToolCallRequest[] = Array.from(toolCallsMap.values()).map(
      (tc) => ({
        callId: tc.callId,
        toolId: tc.toolName,
        arguments: JSON.parse(tc.argChunks.join('') || '{}')
      })
    )

    return { textContent, thinkingContent, toolCalls, stopReason }
  }

  private handleStreamEvent(
    event: ProviderStreamEvent,
    toolCallsMap: Map<string, { callId: string; toolName: string; argChunks: string[] }>,
    onText: (delta: string) => void,
    onThinking: (delta: string) => void
  ): void {
    switch (event.type) {
      case 'text_delta':
        onText(event.delta)
        this.bus.emit({ kind: 'stream_chunk', runId: this.runId, chunk: event.delta })
        break
      case 'thinking_delta':
        onThinking(event.delta)
        this.bus.emit({ kind: 'thinking_chunk', runId: this.runId, chunk: event.delta })
        break
      case 'tool_call_start':
        toolCallsMap.set(event.callId, {
          callId: event.callId,
          toolName: event.toolName,
          argChunks: []
        })
        break
      case 'tool_call_args_delta': {
        const tc = toolCallsMap.get(event.callId)
        if (tc) tc.argChunks.push(event.delta)
        break
      }
      case 'tool_call_end':
        break
    }
  }

  private async executeToolCalls(toolCalls: ToolCallRequest[]): Promise<ToolResult[]> {
    const results: ToolResult[] = []

    for (const tc of toolCalls) {
      const tool = this.toolRegistry.get(tc.toolId)
      if (!tool) {
        results.push({
          callId: tc.callId,
          toolId: tc.toolId,
          success: false,
          content: [],
          error: `Unknown tool: ${tc.toolId}`,
          durationMs: 0
        })
        continue
      }

      this.emitArtifact({
        type: 'tool_input',
        callId: tc.callId,
        toolId: tc.toolId,
        arguments: tc.arguments
      })

      this.emitToolLifecycle(tc.callId, tc.toolId, 'started')
      const startTime = Date.now()

      try {
        const input: ToolInput = { toolId: tc.toolId, arguments: tc.arguments }
        const context = {
          runId: this.runId,
          agentId: this.definition.id,
          step: this.nextStep(),
          signal: this.abortController.signal
        }

        const generator = tool.execute(input, context)
        let result: ToolResult | undefined

        while (true) {
          const iterResult = await generator.next()
          if (iterResult.done) {
            result = iterResult.value
            break
          }
          const progress = iterResult.value
          this.emitToolLifecycle(tc.callId, tc.toolId, progress.status, {
            statusText: progress.statusText,
            phase: progress.phase,
            percent: progress.percent,
            elapsedMs: progress.elapsedMs,
            preview: progress.preview
          })
        }

        if (result) {
          result.callId = tc.callId
          result.durationMs = Date.now() - startTime
          this.emitToolLifecycle(tc.callId, tc.toolId, result.success ? 'completed' : 'failed', {
            elapsedMs: result.durationMs
          })
          results.push(result)
        }
      } catch (err) {
        const elapsed = Date.now() - startTime
        const message = err instanceof Error ? err.message : 'Tool execution error'
        this.emitToolLifecycle(tc.callId, tc.toolId, 'failed', { elapsedMs: elapsed })
        results.push({
          callId: tc.callId,
          toolId: tc.toolId,
          success: false,
          content: [],
          error: message,
          durationMs: elapsed
        })
      }
    }

    return results
  }

  // ---------------------------------------------------------------------------

  private transition(phase: AgentRuntimePhase): void {
    this.state.phase = phase
    this.bus.emit({
      kind: 'run_state_change',
      runId: this.runId,
      phase,
      iteration: this.state.iteration
    })
  }

  private nextStep(): number {
    return ++this.stepCounter
  }

  private emitArtifact(content: ArtifactContent): void {
    const artifact: Artifact = {
      artifactId: crypto.randomUUID(),
      runId: this.runId,
      agentId: this.definition.id,
      step: this.nextStep(),
      type: content.type,
      visible: content.type !== 'thinking',
      createdAt: Date.now(),
      content
    }
    this.state.artifacts.push(artifact)
    this.bus.emit({ kind: 'artifact', artifact })
  }

  private emitToolLifecycle(
    callId: string,
    toolId: string,
    status: ToolLifecycleEvent['status'],
    extra?: Partial<
      Pick<ToolLifecycleEvent, 'statusText' | 'phase' | 'percent' | 'elapsedMs' | 'preview'>
    >
  ): void {
    const event: ToolLifecycleEvent = {
      callId,
      toolId,
      agentId: this.definition.id,
      runId: this.runId,
      step: this.nextStep(),
      status,
      timestamp: Date.now(),
      elapsedMs: 0,
      ...extra
    }
    this.bus.emit({ kind: 'tool_lifecycle', event })
  }
}

function isAbortError(err: unknown): boolean {
  if (!err) return false
  if (typeof err === 'object' && err !== null) {
    const maybeName = (err as { name?: unknown }).name
    if (maybeName === 'AbortError') return true
  }
  return err instanceof Error && /aborted|abort/i.test(err.message)
}
