import type { VectorDocument, VectorSearchPort } from '../../storage/ports/VectorSearchPort'

export interface MessageRecord {
  chatId: string
  chatTitle: string
  messageId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface MessageSearchRequest {
  query: string
  limit?: number
  chatId?: string
  role?: MessageRecord['role']
}

export interface MessageSearchHit {
  id: string
  score: number
  chatId: string
  chatTitle: string
  messageId: string
  role: string
  timestamp: number
  content: string
}

export class MessageMemoryService {
  constructor(private readonly vectorSearch: VectorSearchPort) {}

  async rebuild(records: MessageRecord[]): Promise<void> {
    await this.vectorSearch.clear()
    if (records.length === 0) return
    await this.vectorSearch.index(records.map((record) => this.toDocument(record)))
  }

  async indexMessage(record: MessageRecord): Promise<void> {
    if (!record.content.trim()) return
    await this.vectorSearch.index([this.toDocument(record)])
  }

  async searchMessages(request: MessageSearchRequest): Promise<MessageSearchHit[]> {
    const query = request.query.trim()
    if (!query) return []

    const filter: Record<string, unknown> = {}
    if (request.chatId) filter.chatId = request.chatId
    if (request.role) filter.role = request.role

    const results = await this.vectorSearch.search(query, {
      limit: request.limit ?? 5,
      filter
    })

    return results.map((result) => {
      const metadata = result.document.metadata ?? {}
      return {
        id: result.id,
        score: result.score,
        chatId: String(metadata.chatId ?? ''),
        chatTitle: String(metadata.chatTitle ?? ''),
        messageId: String(metadata.messageId ?? ''),
        role: String(metadata.role ?? ''),
        timestamp: Number(metadata.timestamp ?? 0),
        content: result.document.content
      }
    })
  }

  private toDocument(record: MessageRecord): VectorDocument {
    return {
      id: this.toDocumentId(record.chatId, record.messageId),
      content: record.content,
      metadata: {
        chatId: record.chatId,
        messageId: record.messageId,
        role: record.role,
        timestamp: record.timestamp,
        chatTitle: record.chatTitle
      }
    }
  }

  private toDocumentId(chatId: string, messageId: string): string {
    return `${chatId}:${messageId}`
  }
}
