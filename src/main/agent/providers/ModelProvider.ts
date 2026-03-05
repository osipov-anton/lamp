import type { NormalizedMessage, ProviderStreamEvent, ToolSchema } from '../runtime/types'

export interface ModelProviderCapabilities {
  supportsToolCalling: boolean
  supportsImageOutput: boolean
  supportsReasoningTokens: boolean
  supportsJsonMode: boolean
  supportsStreaming: boolean
}

export interface StreamRequestOptions {
  model: string
  messages: NormalizedMessage[]
  tools?: ToolSchema[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export interface ModelProvider {
  readonly id: string
  readonly capabilities: ModelProviderCapabilities

  streamResponse(options: StreamRequestOptions): AsyncIterable<ProviderStreamEvent>
}
