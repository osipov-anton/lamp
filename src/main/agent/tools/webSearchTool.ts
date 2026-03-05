import type {
  ToolDefinition,
  ToolInput,
  ToolExecutionContext,
  ToolProgressEvent,
  ToolResult
} from '../runtime/types'
import { withProxyRequestInit } from '../../network/proxyDispatcher'

export const WEB_SEARCH_TOOL_ID = 'web_search'

const SONAR_MODEL = 'perplexity/sonar-pro'
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

export interface WebSearchToolConfig {
  getApiKey: () => string
  getProxyUrl?: () => string | undefined
  baseUrl?: string
}

export function createWebSearchTool(config: WebSearchToolConfig): ToolDefinition {
  return {
    id: WEB_SEARCH_TOOL_ID,
    version: '1.0.0',
    name: 'web_search',
    description:
      'Search the web for real-time information using Perplexity Sonar Pro. Returns a grounded answer with source citations.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query — a natural language question works best'
        }
      },
      required: ['query']
    },

    async *execute(
      input: ToolInput,
      context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      const query = input.arguments.query as string
      const startTime = Date.now()
      console.log('[web_search] executing query:', query)
      const apiKey = config.getApiKey()

      if (!apiKey) {
        return {
          callId: '',
          toolId: WEB_SEARCH_TOOL_ID,
          success: false,
          content: [],
          error: 'OpenRouter API key is not configured',
          durationMs: 0
        }
      }

      yield {
        callId: '',
        toolId: WEB_SEARCH_TOOL_ID,
        status: 'started',
        statusText: `Searching: "${query}"`,
        phase: 'requesting',
        elapsedMs: 0
      }

      const baseUrl = config.baseUrl ?? OPENROUTER_BASE

      try {
        const response = await fetch(
          `${baseUrl}/chat/completions`,
          withProxyRequestInit(
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://lamp-desktop.app',
                'X-Title': 'Lamp Desktop'
              },
              body: JSON.stringify({
                model: SONAR_MODEL,
                messages: [{ role: 'user', content: query }],
                stream: true
              }),
              signal: context.signal
            },
            config.getProxyUrl?.()
          )
        )

        console.log('[web_search] sonar response status:', response.status)

        if (!response.ok) {
          const body = await response.text()
          console.error('[web_search] sonar error:', body)
          let msg = `Sonar API error ${response.status}`
          try {
            msg = JSON.parse(body).error?.message || msg
          } catch {}
          return {
            callId: '',
            toolId: WEB_SEARCH_TOOL_ID,
            success: false,
            content: [],
            error: msg,
            durationMs: Date.now() - startTime
          }
        }

        const reader = response.body?.getReader()
        if (!reader) {
          return {
            callId: '',
            toolId: WEB_SEARCH_TOOL_ID,
            success: false,
            content: [],
            error: 'No response body from Sonar',
            durationMs: Date.now() - startTime
          }
        }

        yield {
          callId: '',
          toolId: WEB_SEARCH_TOOL_ID,
          status: 'progress',
          statusText: 'Reading search results...',
          phase: 'streaming',
          elapsedMs: Date.now() - startTime
        }

        console.log('[web_search] consuming sonar stream...')
        const { text, citations } = await consumeSonarStream(reader, function* (preview) {
          void preview
        })

        console.log('[web_search] sonar stream done, text length:', text.length, 'citations:', citations.length)
        const citationBlock = formatCitations(citations)
        const fullText = citationBlock ? `${text}\n\n${citationBlock}` : text

        yield {
          callId: '',
          toolId: WEB_SEARCH_TOOL_ID,
          status: 'progress',
          statusText: `Done — ${citations.length} sources`,
          phase: 'complete',
          percent: 100,
          elapsedMs: Date.now() - startTime,
          preview: fullText.slice(0, 300)
        }

        return {
          callId: '',
          toolId: WEB_SEARCH_TOOL_ID,
          success: true,
          content: [{ type: 'text', text: fullText || 'No results found.' }],
          durationMs: Date.now() - startTime
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return {
            callId: '',
            toolId: WEB_SEARCH_TOOL_ID,
            success: false,
            content: [],
            error: 'Search cancelled',
            durationMs: Date.now() - startTime
          }
        }
        return {
          callId: '',
          toolId: WEB_SEARCH_TOOL_ID,
          success: false,
          content: [],
          error: err instanceof Error ? err.message : 'Search failed',
          durationMs: Date.now() - startTime
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------

async function consumeSonarStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  _onPreview: (text: string) => void
): Promise<{ text: string; citations: string[] }> {
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let citations: string[] = []

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content
          if (typeof delta === 'string') {
            text += delta
          }
          if (Array.isArray(parsed.citations)) {
            citations = parsed.citations
          }
        } catch {}
      }
    }
  } finally {
    reader.releaseLock()
  }

  return { text, citations }
}

function formatCitations(citations: string[]): string {
  if (citations.length === 0) return ''
  return (
    'Sources:\n' +
    citations.map((url, i) => `[${i + 1}] ${url}`).join('\n')
  )
}
