import { create, search, upsert } from '@orama/orama'
import type {
  VectorDocument,
  VectorSearchOptions,
  VectorSearchPort,
  VectorSearchResult
} from '../../ports/VectorSearchPort'

type MessageIndexDoc = {
  id: string
  content: string
  chatId: string
  messageId: string
  role: string
  timestamp: number
  chatTitle: string
}

export class OramaVectorSearchAdapter implements VectorSearchPort {
  private dbPromise = this.createDb()

  async clear(): Promise<void> {
    this.dbPromise = this.createDb()
  }

  async index(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return
    const db = await this.dbPromise
    for (const document of documents) {
      const doc = this.toMessageIndexDoc(document)
      if (!doc.content.trim()) continue
      await upsert(db, doc)
    }
  }

  async search(query: string, options?: VectorSearchOptions): Promise<VectorSearchResult[]> {
    const db = await this.dbPromise
    const result = await search(db, {
      term: query,
      limit: options?.limit ?? 5,
      properties: ['content'],
      where: (options?.filter ?? {}) as Record<string, unknown>
    })

    return result.hits.map((hit) => {
      const doc = hit.document as MessageIndexDoc
      return {
        id: doc.id,
        score: Number(hit.score),
        document: {
          id: doc.id,
          content: doc.content,
          metadata: {
            chatId: doc.chatId,
            messageId: doc.messageId,
            role: doc.role,
            timestamp: doc.timestamp,
            chatTitle: doc.chatTitle
          }
        }
      }
    })
  }

  async deleteByRunId(_runId: string): Promise<void> {
    // Not used in message memory flows yet.
  }

  private toMessageIndexDoc(document: VectorDocument): MessageIndexDoc {
    const metadata = document.metadata ?? {}
    return {
      id: document.id,
      content: document.content,
      chatId: String(metadata.chatId ?? ''),
      messageId: String(metadata.messageId ?? ''),
      role: String(metadata.role ?? ''),
      timestamp: Number(metadata.timestamp ?? 0),
      chatTitle: String(metadata.chatTitle ?? '')
    }
  }

  private createDb() {
    return create({
      schema: {
        id: 'string',
        content: 'string',
        chatId: 'string',
        messageId: 'string',
        role: 'string',
        timestamp: 'number',
        chatTitle: 'string'
      }
    })
  }
}
