import type { AgentRuntimePhase } from '../../agent/runtime/types'

export interface RunRecord {
  runId: string
  agentId: string
  chatId: string
  parentRunId?: string
  depth: number
  phase: AgentRuntimePhase
  iterations: number
  startedAt: number
  completedAt?: number
  finalText?: string
  error?: string
}

export interface RunRepository {
  save(run: RunRecord): Promise<void>
  getById(runId: string): Promise<RunRecord | null>
  getByChatId(chatId: string): Promise<RunRecord[]>
  getByParentRunId(parentRunId: string): Promise<RunRecord[]>
  update(runId: string, updates: Partial<RunRecord>): Promise<void>
}
