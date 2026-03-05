import type { ProviderStreamEvent } from '../../runtime/types'
import type { ModelProvider, ModelProviderCapabilities, StreamRequestOptions } from '../ModelProvider'

/**
 * Skeleton for direct provider adapters (OpenAI, Anthropic, etc.).
 * Subclass and implement streamResponse to connect to the original API.
 */
export abstract class DirectProviderAdapter implements ModelProvider {
  abstract readonly id: string
  abstract readonly capabilities: ModelProviderCapabilities

  abstract streamResponse(options: StreamRequestOptions): AsyncIterable<ProviderStreamEvent>
}
