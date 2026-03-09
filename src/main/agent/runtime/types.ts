// ---------------------------------------------------------------------------
// Agent Runtime – canonical types
// ---------------------------------------------------------------------------

// === Model / provider config ================================================

export interface ModelConfig {
  model: string
  temperature?: number
  maxTokens?: number
  topP?: number
}

// === Agent definition =======================================================

export interface AgentDefinition {
  id: string
  name: string
  systemPrompt: string
  modelConfig: ModelConfig
  maxIterations: number
  allowedTools: string[]
  providerProfile: string
}

// === Run context ============================================================

export interface RunContext {
  runId: string
  agentId: string
  chatId: string
  threadId: string
  parentRunId?: string
  depth: number
  startedAt: number
  iterationBudget: number
}

// === Runtime state machine ==================================================

export type AgentRuntimePhase =
  | 'init'
  | 'thinking'
  | 'tool_call'
  | 'observing'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface AgentRuntimeState {
  phase: AgentRuntimePhase
  runContext: RunContext
  iteration: number
  artifacts: Artifact[]
  pendingToolCalls: ToolCallRequest[]
  error?: string
}

// === Tools ==================================================================

export interface ToolSchema {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ToolExecutionContext {
  runId: string
  agentId: string
  step: number
  signal: AbortSignal
}

export interface ToolDefinition {
  id: string
  version: string
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (
    input: ToolInput,
    context: ToolExecutionContext
  ) => AsyncGenerator<ToolProgressEvent, ToolResult>
}

export interface ToolInput {
  toolId: string
  arguments: Record<string, unknown>
}

export interface ToolCallRequest {
  callId: string
  toolId: string
  arguments: Record<string, unknown>
}

// === Tool results ===========================================================

export type ToolResultContent =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; filePath: string; alt?: string }

export interface ToolResult {
  callId: string
  toolId: string
  success: boolean
  content: ToolResultContent[]
  error?: string
  durationMs: number
}

// === Tool lifecycle =========================================================

export type ToolLifecycleStatus =
  | 'queued'
  | 'started'
  | 'progress'
  | 'partial_output'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface ToolProgressEvent {
  callId: string
  toolId: string
  status: ToolLifecycleStatus
  statusText?: string
  phase?: string
  percent?: number
  elapsedMs: number
  preview?: string
}

export interface ToolLifecycleEvent {
  callId: string
  toolId: string
  agentId: string
  runId: string
  step: number
  status: ToolLifecycleStatus
  statusText?: string
  phase?: string
  percent?: number
  elapsedMs: number
  preview?: string
  error?: string
  timestamp: number
}

// === Artifacts ==============================================================

export type ArtifactType =
  | 'thinking'
  | 'tool_input'
  | 'tool_output_text'
  | 'tool_output_image'
  | 'error'
  | 'final'

export type ArtifactContent =
  | { type: 'thinking'; text: string }
  | {
      type: 'tool_input'
      callId: string
      toolId: string
      arguments: Record<string, unknown>
    }
  | { type: 'tool_output_text'; callId: string; toolId: string; text: string }
  | {
      type: 'tool_output_image'
      callId: string
      toolId: string
      mimeType: string
      filePath: string
      alt?: string
    }
  | { type: 'error'; message: string; code?: string }
  | { type: 'final'; text: string }

export interface Artifact {
  artifactId: string
  runId: string
  agentId: string
  step: number
  type: ArtifactType
  visible: boolean
  createdAt: number
  content: ArtifactContent
}

// === ArtifactBus events =====================================================

export type ArtifactBusEvent =
  | { kind: 'artifact'; artifact: Artifact }
  | { kind: 'tool_lifecycle'; event: ToolLifecycleEvent }
  | { kind: 'stream_chunk'; runId: string; chunk: string }
  | { kind: 'thinking_chunk'; runId: string; chunk: string }
  | {
      kind: 'run_state_change'
      runId: string
      phase: AgentRuntimePhase
      iteration: number
    }
  | { kind: 'run_complete'; runId: string; finalText: string }
  | { kind: 'run_error'; runId: string; error: string }

export type ArtifactBusListener = (event: ArtifactBusEvent) => void

// === Normalized messages (provider-agnostic) ================================

export interface NormalizedMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  attachments?: NormalizedUserAttachment[]
  toolCalls?: { callId: string; toolName: string; arguments: string }[]
  toolCallId?: string
}

export type NormalizedUserAttachment =
  | { type: 'image'; name: string; mimeType: string; dataUrl: string }
  | { type: 'pdf'; name: string; mimeType: string; dataUrl: string }
  | { type: 'file'; name: string; mimeType: string; textContent: string }

// === Provider stream events (canonical format) ==============================

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'

export type ProviderStreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'tool_call_start'; callId: string; toolName: string }
  | { type: 'tool_call_args_delta'; callId: string; delta: string }
  | { type: 'tool_call_end'; callId: string }
  | {
      type: 'usage'
      promptTokens: number
      completionTokens: number
      totalTokens: number
    }
  | { type: 'done'; stopReason: StopReason }
  | { type: 'error'; error: string }
