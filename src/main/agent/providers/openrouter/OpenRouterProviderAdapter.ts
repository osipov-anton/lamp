import type { ProviderStreamEvent, NormalizedMessage } from '../../runtime/types'
import type { ModelProvider, ModelProviderCapabilities, StreamRequestOptions } from '../ModelProvider'
import { withProxyRequestInit } from '../../../network/proxyDispatcher'

interface OpenRouterConfig {
  apiKey: string
  baseUrl?: string
  siteUrl?: string
  siteName?: string
  proxyUrl?: string
}

export class OpenRouterProviderAdapter implements ModelProvider {
  readonly id = 'openrouter'
  readonly capabilities: ModelProviderCapabilities = {
    supportsToolCalling: true,
    supportsImageOutput: false,
    supportsReasoningTokens: true,
    supportsJsonMode: true,
    supportsStreaming: true
  }

  private config: OpenRouterConfig
  private hasWarnedUnexpectedEmbeddingShape = false

  constructor(config: OpenRouterConfig) {
    this.config = config
  }

  updateApiKey(apiKey: string): void {
    this.config.apiKey = apiKey
  }

  updateProxyUrl(proxyUrl: string | undefined): void {
    this.config.proxyUrl = proxyUrl?.trim() || undefined
  }

  async embedText(input: string, model = 'openai/text-embedding-3-small'): Promise<number[]> {
    const text = input.trim()
    if (!text) return []
    const baseUrl = this.config.baseUrl ?? 'https://openrouter.ai/api/v1'
    const response = await fetch(
      `${baseUrl}/embeddings`,
      withProxyRequestInit(
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': this.config.siteUrl ?? 'https://lamp-desktop.app',
            'X-Title': this.config.siteName ?? 'Lamp Desktop'
          },
          body: JSON.stringify({
            model,
            input: text
          })
        },
        this.config.proxyUrl
      )
    )
    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`OpenRouter embeddings error ${response.status}: ${errorBody}`)
    }
    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>
      error?: { message?: string }
    }

    if (payload.error?.message) {
      throw new Error(`OpenRouter embeddings payload error: ${payload.error.message}`)
    }

    const embedding = payload.data?.[0]?.embedding
    if (Array.isArray(embedding) && embedding.length > 0) return embedding

    if (!this.hasWarnedUnexpectedEmbeddingShape) {
      this.hasWarnedUnexpectedEmbeddingShape = true
      console.warn(
        '[openrouter] embeddings response missing data[0].embedding, falling back to text-only retrieval.',
        '\nmodel:', model,
        '\npayload preview:', JSON.stringify(payload).slice(0, 1200)
      )
    }
    return []
  }

  async *streamResponse(options: StreamRequestOptions): AsyncIterable<ProviderStreamEvent> {
    const { model, messages, tools, temperature, maxTokens, signal } = options
    console.log('[openrouter] streamResponse model:', model, 'tools:', tools?.length ?? 0, 'messages:', messages.length)

    const convertedMessages = this.toOpenRouterMessages(messages)
    if (messages.length > 2) {
      console.log('[openrouter] messages payload:', JSON.stringify(convertedMessages, null, 2))
    }

    const body: Record<string, unknown> = {
      model,
      messages: convertedMessages,
      stream: true
    }

    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema
        }
      }))
    }

    if (temperature !== undefined) body.temperature = temperature
    if (maxTokens !== undefined) body.max_tokens = maxTokens

    const baseUrl = this.config.baseUrl ?? 'https://openrouter.ai/api/v1'

    const response = await fetch(
      `${baseUrl}/chat/completions`,
      withProxyRequestInit(
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': this.config.siteUrl ?? 'https://lamp-desktop.app',
            'X-Title': this.config.siteName ?? 'Lamp Desktop'
          },
          body: JSON.stringify(body),
          signal
        },
        this.config.proxyUrl
      )
    )

    console.log('[openrouter] response status:', response.status)

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[openrouter] error body:', errorBody)
      let errorMsg = `OpenRouter API error ${response.status}`
      try {
        const parsed = JSON.parse(errorBody)
        errorMsg = parsed.error?.message || errorMsg
      } catch {
        // use default
      }
      yield { type: 'error', error: errorMsg }
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      yield { type: 'error', error: 'No response body from OpenRouter' }
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''
    const indexToCallId = new Map<number, string>()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const events = this.parseSSELine(line, indexToCallId)
          for (const event of events) {
            if (event.type !== 'text_delta' && event.type !== 'thinking_delta') {
              console.log('[openrouter] event:', JSON.stringify(event))
            }
            yield event
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  private parseSSELine(
    line: string,
    indexToCallId: Map<number, string>
  ): ProviderStreamEvent[] {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.startsWith('data: ')) return []
    const data = trimmed.slice(6)
    if (data === '[DONE]') return [{ type: 'done', stopReason: 'end_turn' }]

    try {
      const parsed = JSON.parse(data)
      return this.normalizeChunk(parsed, indexToCallId)
    } catch {
      return []
    }
  }

  private normalizeChunk(
    chunk: Record<string, unknown>,
    indexToCallId: Map<number, string>
  ): ProviderStreamEvent[] {
    const events: ProviderStreamEvent[] = []
    const choices = chunk.choices as Array<Record<string, unknown>> | undefined
    if (!choices?.length) return events

    const choice = choices[0]
    const delta = choice.delta as Record<string, unknown> | undefined
    const finishReason = choice.finish_reason as string | null

    if (delta) {
      if (typeof delta.content === 'string' && delta.content) {
        events.push({ type: 'text_delta', delta: delta.content })
      }

      if (typeof delta.reasoning === 'string' && delta.reasoning) {
        events.push({ type: 'thinking_delta', delta: delta.reasoning })
      }

      const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined
      if (toolCalls) {
        for (const tc of toolCalls) {
          const idx = (tc.index as number) ?? 0
          const fn = tc.function as Record<string, unknown> | undefined

          if (tc.id) {
            indexToCallId.set(idx, tc.id as string)
          }

          const callId = indexToCallId.get(idx) ?? ''

          if (tc.id && fn?.name) {
            events.push({
              type: 'tool_call_start',
              callId,
              toolName: fn.name as string
            })
          }

          if (fn?.arguments && typeof fn.arguments === 'string') {
            events.push({
              type: 'tool_call_args_delta',
              callId,
              delta: fn.arguments
            })
          }
        }
      }
    }

    if (finishReason) {
      const stopReason = this.mapFinishReason(finishReason)
      events.push({ type: 'done', stopReason })
    }

    const usage = chunk.usage as Record<string, number> | undefined
    if (usage) {
      events.push({
        type: 'usage',
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0
      })
    }

    return events
  }

  private mapFinishReason(reason: string): ProviderStreamEvent & { type: 'done' } extends { stopReason: infer R } ? R : never {
    switch (reason) {
      case 'tool_calls':
        return 'tool_use'
      case 'length':
        return 'max_tokens'
      case 'stop':
      default:
        return 'end_turn'
    }
  }

  private toOpenRouterMessages(
    messages: NormalizedMessage[]
  ): Record<string, unknown>[] {
    return messages.map((m) => {
      const msg: Record<string, unknown> = { role: m.role }

      if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
        msg.content = this.buildUserContentParts(m)
      } else if (m.content !== undefined) {
        msg.content = m.content
      } else if (m.toolCalls) {
        msg.content = null
      }

      if (m.toolCalls) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.callId,
          type: 'function',
          function: { name: tc.toolName, arguments: tc.arguments }
        }))
      }

      if (m.toolCallId) {
        msg.tool_call_id = m.toolCallId
      }

      return msg
    })
  }

  private buildUserContentParts(message: NormalizedMessage): Array<Record<string, unknown>> {
    const contentParts: Array<Record<string, unknown>> = []

    if (message.content && message.content.trim().length > 0) {
      contentParts.push({
        type: 'text',
        text: message.content
      })
    }

    for (const attachment of message.attachments ?? []) {
      if (attachment.type === 'image') {
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: attachment.dataUrl
          }
        })
        continue
      }

      if (attachment.type === 'pdf') {
        contentParts.push({
          type: 'file',
          file: {
            filename: attachment.name,
            file_data: attachment.dataUrl
          }
        })
        continue
      }

      contentParts.push({
        type: 'text',
        text: `Attached file "${attachment.name}" (${attachment.mimeType}):\n${attachment.textContent}`
      })
    }

    if (contentParts.length === 0) {
      contentParts.push({ type: 'text', text: '' })
    }

    return contentParts
  }
}
