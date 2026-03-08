import { withProxyRequestInit } from '../../network/proxyDispatcher'

export interface ExtractedEntityRef {
  entityType: 'person' | 'project' | 'task' | 'org' | 'tool' | 'topic' | 'chat'
  label: string
  role: 'about' | 'owns' | 'prefers' | 'blocked_by' | 'works_on'
}

export interface ExtractedFact {
  statement: string
  factType: string
  confidence: number
  entityRefs: ExtractedEntityRef[]
}

export class FactExtractionService {
  constructor(
    private readonly getApiKey: () => string,
    private readonly getProxyUrl: () => string | undefined = () => undefined,
    private readonly getModel: () => string = () => 'openai/gpt-4o-mini'
  ) {}

  async extractFromText(input: {
    chatId: string
    threadId: string
    role: 'user' | 'assistant' | 'system'
    content: string
  }): Promise<ExtractedFact[]> {
    const apiKey = this.getApiKey()
    const model = this.getModel().trim() || 'openai/gpt-4o-mini'
    const text = input.content.trim()
    if (!apiKey || !text) return []

    try {
      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
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
              model,
              temperature: 0,
              messages: [
                {
                  role: 'system',
                  content:
                    'Extract durable facts from a message. Return STRICT JSON: {"facts":[{statement,factType,confidence,entityRefs:[{entityType,label,role}]}]}. ' +
                    'Only include useful facts for future conversations. confidence is 0..1.'
                },
                {
                  role: 'user',
                  content: `chatId=${input.chatId}\nthreadId=${input.threadId}\nrole=${input.role}\nmessage=${text}`
                }
              ]
            })
          },
          this.getProxyUrl()
        )
      )
      if (!response.ok) return []
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const content = payload.choices?.[0]?.message?.content ?? ''
      const parsed = this.parseFactsFromText(content)
      return parsed
    } catch {
      return []
    }
  }

  private parseFactsFromText(content: string): ExtractedFact[] {
    const trimmed = content.trim()
    if (!trimmed) return []
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start < 0 || end <= start) return []
    try {
      const json = JSON.parse(trimmed.slice(start, end + 1)) as {
        facts?: Array<{
          statement?: string
          factType?: string
          confidence?: number
          entityRefs?: Array<{
            entityType?: ExtractedEntityRef['entityType']
            label?: string
            role?: ExtractedEntityRef['role']
          }>
        }>
      }
      return (json.facts ?? [])
        .map((fact) => ({
          statement: String(fact.statement ?? '').trim(),
          factType: String(fact.factType ?? 'general').trim(),
          confidence: Number.isFinite(fact.confidence) ? Number(fact.confidence) : 0.5,
          entityRefs: (fact.entityRefs ?? [])
            .map((ref) => ({
              entityType: this.safeEntityType(ref.entityType),
              label: String(ref.label ?? '').trim(),
              role: this.safeRole(ref.role)
            }))
            .filter((ref) => ref.label.length > 0)
        }))
        .filter((fact) => fact.statement.length > 0)
    } catch {
      return []
    }
  }

  private safeEntityType(value: unknown): ExtractedEntityRef['entityType'] {
    switch (value) {
      case 'person':
      case 'project':
      case 'task':
      case 'org':
      case 'tool':
      case 'topic':
      case 'chat':
        return value
      default:
        return 'topic'
    }
  }

  private safeRole(value: unknown): ExtractedEntityRef['role'] {
    switch (value) {
      case 'about':
      case 'owns':
      case 'prefers':
      case 'blocked_by':
      case 'works_on':
        return value
      default:
        return 'about'
    }
  }
}
