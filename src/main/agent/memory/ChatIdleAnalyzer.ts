import type { SupervisorRouter } from '../orchestrator/SupervisorRouter'
import { buildMemoryCuratorSystemPrompt } from '../bootstrap'
import { getSettings } from '../../store'

interface ThreadMessageSnapshot {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp?: number
}

type MessageProvider = (chatId: string, threadId: string) => ThreadMessageSnapshot[]

export class ChatIdleAnalyzer {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private running = new Set<string>()

  constructor(
    private readonly router: SupervisorRouter,
    private readonly getMessagesForThread: MessageProvider,
    private readonly idleMs = 60_000
  ) {}

  schedule(chatId: string, threadId: string): void {
    const key = `${chatId}:${threadId}`
    const active = this.timers.get(key)
    if (active) clearTimeout(active)
    const timer = setTimeout(() => {
      void this.runCurator(chatId, threadId)
    }, this.idleMs)
    this.timers.set(key, timer)
  }

  private async runCurator(chatId: string, threadId: string): Promise<void> {
    const key = `${chatId}:${threadId}`
    if (this.running.has(key)) return
    this.running.add(key)
    try {
      const curator = this.router.getAgent('memory_curator')
      if (curator) {
        const settings = getSettings()
        curator.modelConfig.model =
          settings.memoryModel || settings.model || 'anthropic/claude-sonnet-4.6'
        curator.systemPrompt = buildMemoryCuratorSystemPrompt(new Date())
      }

      const history = this.getMessagesForThread(chatId, threadId)
      if (history.length === 0) return
      const maxWindow = 20
      const latest = history.slice(-maxWindow)
      const task =
        `Current date: ${new Date().toISOString()}\n\n` +
        'Curate and clean memory from this thread history. Extract important facts, merge duplicates, archive stale ones.' +
        '\nUse the message timestamps when judging recency and whether facts may be outdated.' +
        '\n\nThread messages:\n' +
        latest
          .map((msg) => `[${this.formatTimestamp(msg.timestamp)}] ${msg.role}: ${msg.content ?? ''}`)
          .join('\n')

      await this.router.executeRun('memory_curator', chatId, threadId, [
        { role: 'user', content: task }
      ])
    } catch (error) {
      console.warn('[memory] idle curator run failed:', error)
    } finally {
      this.running.delete(key)
    }
  }

  private formatTimestamp(timestamp?: number): string {
    if (!Number.isFinite(timestamp)) return 'unknown-time'
    return new Date(timestamp as number).toISOString()
  }
}
