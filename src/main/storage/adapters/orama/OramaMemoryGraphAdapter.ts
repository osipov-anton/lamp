import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { create, insert, load, remove, save, search, upsert } from '@orama/orama'
import type {
  EntityNode,
  FactNode,
  FactSearchHit,
  MemoryGraphPort,
  MemoryQueryOptions,
  MessageMemoryDocument,
  MessageSearchHit,
  UpsertFactInput
} from '../../ports/MemoryGraphPort'

type MessageDoc = MessageMemoryDocument & {
  contentEmbedding: number[]
  contentHash: string
}

type EntityDoc = {
  entityId: string
  entityType: string
  labels: string
  aliases: string
  channelIdentities: string
  mergedInto: string
  labelEmbedding: number[]
  createdAt: number
  updatedAt: number
}

type FactDoc = {
  factId: string
  statement: string
  factType: string
  confidence: number
  priority: number
  recency: number
  entityRefs: string
  sourceMessageIds: string
  isArchived: boolean
  supersededBy: string
  statementEmbedding: number[]
  contentHash: string
  createdAt: number
  updatedAt: number
}

type EmbeddingFn = (text: string) => Promise<number[]>

const EMBEDDING_DIM = 1536

export class OramaMemoryGraphAdapter implements MemoryGraphPort {
  private messagesDbPromise = this.createMessageDb()
  private entitiesDbPromise = this.createEntityDb()
  private factsDbPromise = this.createFactDb()
  private readyPromise: Promise<void>

  private readonly dataDir: string
  private readonly messageDbPath: string
  private readonly entityDbPath: string
  private readonly factDbPath: string

  constructor(private readonly embeddingFn: EmbeddingFn) {
    this.dataDir = join(app.getPath('userData'), 'lamp-data')
    this.messageDbPath = join(this.dataDir, 'memory-messages.odb')
    this.entityDbPath = join(this.dataDir, 'memory-entities.odb')
    this.factDbPath = join(this.dataDir, 'memory-facts.odb')
    this.readyPromise = this.loadFromDisk()
  }

  async rebuildMessages(messages: MessageMemoryDocument[]): Promise<void> {
    await this.ready()
    this.messagesDbPromise = this.createMessageDb()
    const db = await this.messagesDbPromise
    for (const message of messages) {
      const doc = await this.toMessageDoc(message)
      if (!doc.content.trim()) continue
      await insert(db, doc)
    }
    await this.persistMessages()
  }

  async upsertMessage(message: MessageMemoryDocument): Promise<void> {
    await this.ready()
    const db = await this.messagesDbPromise
    const doc = await this.toMessageDoc(message)
    if (!doc.content.trim()) return
    await upsert(db, doc)
    await this.persistMessages()
  }

  async searchMessages(
    query: string,
    options?: { limit?: number; chatId?: string; role?: string }
  ): Promise<MessageSearchHit[]> {
    await this.ready()
    const db = await this.messagesDbPromise
    const term = query.trim()
    if (!term) return []

    const where: Record<string, unknown> = {}
    if (options?.chatId) where.chatId = options.chatId
    if (options?.role) where.role = options.role

    const embedding = await this.safeEmbedding(term)
    const result = embedding
      ? await search(db, {
          mode: 'hybrid',
          term,
          vector: {
            value: embedding,
            property: 'contentEmbedding'
          },
          limit: options?.limit ?? 5,
          properties: ['content', 'chatTitle', 'senderName'],
          where
        })
      : await search(db, {
          term,
          limit: options?.limit ?? 5,
          properties: ['content', 'chatTitle', 'senderName'],
          where
        })

    return result.hits.map((hit) => ({
      score: Number(hit.score),
      message: this.fromMessageDoc(hit.document as MessageDoc)
    }))
  }

  async getMessageById(messageId: string): Promise<MessageMemoryDocument | null> {
    await this.ready()
    const db = await this.messagesDbPromise
    const result = await search(db, {
      term: '',
      limit: 1,
      where: { messageId }
    })
    const hit = result.hits[0]
    return hit ? this.fromMessageDoc(hit.document as MessageDoc) : null
  }

  async ensureEntity(input: { entityId?: string; entityType: string; label: string }): Promise<EntityNode> {
    await this.ready()
    if (input.entityId) {
      const existingById = await this.getEntityById(input.entityId)
      if (existingById) return this.fromEntityDoc(existingById)
      const now = Date.now()
      const doc: EntityDoc = {
        entityId: input.entityId,
        entityType: input.entityType,
        labels: input.label.trim(),
        aliases: '',
        channelIdentities: '[]',
        mergedInto: '',
        labelEmbedding: (await this.safeEmbedding(input.label)) ?? this.emptyVector(),
        createdAt: now,
        updatedAt: now
      }
      const db = await this.entitiesDbPromise
      await insert(db, doc)
      await this.persistEntities()
      return this.fromEntityDoc(doc)
    }
    return this.upsertEntity({ entityType: input.entityType, label: input.label })
  }

  async queryFacts(options: MemoryQueryOptions): Promise<FactSearchHit[]> {
    await this.ready()
    const db = await this.factsDbPromise
    const query = options.query.trim()
    if (!query) return []

    const where: Record<string, unknown> = {}
    if (!options.includeArchived) where.isArchived = false
    if (options.factType) where.factType = options.factType

    const embedding = await this.safeEmbedding(query)
    const result = embedding
      ? await search(db, {
          mode: 'hybrid',
          term: query,
          vector: {
            value: embedding,
            property: 'statementEmbedding'
          },
          properties: ['statement'],
          where,
          limit: options.limit ?? 10
        })
      : await search(db, {
          term: query,
          properties: ['statement'],
          where,
          limit: options.limit ?? 10
        })

    return result.hits
      .map((hit) => ({ score: Number(hit.score), fact: this.fromFactDoc(hit.document as FactDoc) }))
      .filter((hit) => {
        if (!options.entityType) return true
        return hit.fact.entityRefs.some((entity) => entity.entityType === options.entityType)
      })
  }

  async upsertFact(input: UpsertFactInput): Promise<FactNode> {
    await this.ready()
    const now = Date.now()
    const statement = input.statement.trim()
    const factId = input.factId ?? crypto.randomUUID()
    const contentHash = this.hashText(statement)

    const entityRefs = await Promise.all(
      input.entityRefs.map(async (ref) => {
        if (ref.entityId) return ref as Required<typeof ref>
        const entity = await this.upsertEntity({
          entityType: ref.entityType,
          label: ref.label
        })
        return {
          entityId: entity.entityId,
          entityType: ref.entityType,
          label: ref.label,
          role: ref.role
        }
      })
    )

    const embedding = await this.safeEmbedding(statement)
    const db = await this.factsDbPromise
    const existing = await this.getFactById(factId)

    const doc: FactDoc = {
      factId,
      statement,
      factType: input.factType,
      confidence: Math.max(0, Math.min(1, input.confidence)),
      priority: input.priority ?? existing?.priority ?? input.confidence,
      recency: input.recency ?? now,
      entityRefs: JSON.stringify(entityRefs),
      sourceMessageIds: JSON.stringify(input.sourceMessageIds),
      isArchived: false,
      supersededBy: '',
      statementEmbedding: embedding ?? existing?.statementEmbedding ?? this.emptyVector(),
      contentHash,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }

    await upsert(db, doc)

    if (input.supersedes) {
      const superseded = await this.getFactById(input.supersedes)
      if (superseded) {
        superseded.isArchived = true
        superseded.supersededBy = factId
        superseded.updatedAt = now
        await upsert(db, superseded)
      }
    }

    await this.persistFacts()
    return this.fromFactDoc(doc)
  }

  async archiveFacts(factIds: string[], _reason: string): Promise<number> {
    await this.ready()
    const db = await this.factsDbPromise
    let changed = 0
    for (const factId of factIds) {
      const doc = await this.getFactById(factId)
      if (!doc || doc.isArchived) continue
      doc.isArchived = true
      doc.updatedAt = Date.now()
      await upsert(db, doc)
      changed++
    }
    if (changed > 0) {
      await this.persistFacts()
    }
    return changed
  }

  async mergeEntities(keepEntityId: string, mergeEntityId: string, _reason: string): Promise<void> {
    await this.ready()
    const entitiesDb = await this.entitiesDbPromise
    const factsDb = await this.factsDbPromise
    const keep = await this.getEntityById(keepEntityId)
    const merge = await this.getEntityById(mergeEntityId)
    if (!keep || !merge) return

    const keepAliases = new Set(this.parseAliases(keep.aliases))
    for (const alias of this.parseAliases(merge.aliases)) keepAliases.add(alias)
    if (merge.labels.trim()) keepAliases.add(merge.labels.trim())
    keep.aliases = Array.from(keepAliases).join(' ')
    keep.updatedAt = Date.now()
    keep.labelEmbedding = (await this.safeEmbedding([keep.labels, keep.aliases].join(' '))) ?? keep.labelEmbedding
    await upsert(entitiesDb, keep)

    merge.mergedInto = keepEntityId
    merge.updatedAt = Date.now()
    await upsert(entitiesDb, merge)

    const allFacts = await search(factsDb, { term: '', limit: 10_000 })
    for (const hit of allFacts.hits) {
      const doc = hit.document as FactDoc
      const refs = this.parseJson<Array<{ entityId: string }>>(doc.entityRefs, [])
      let touched = false
      const updatedRefs = refs.map((ref) => {
        if (ref.entityId === mergeEntityId) {
          touched = true
          return { ...ref, entityId: keepEntityId }
        }
        return ref
      })
      if (!touched) continue
      doc.entityRefs = JSON.stringify(updatedRefs)
      doc.updatedAt = Date.now()
      await upsert(factsDb, doc)
    }

    await Promise.all([this.persistEntities(), this.persistFacts()])
  }

  async linkIdentity(input: {
    entityId: string
    channelType: 'telegram' | 'email' | 'whatsapp' | 'local_chat'
    externalId: string
    displayName: string
    confidence: number
  }): Promise<EntityNode> {
    await this.ready()
    const entity = await this.getEntityById(input.entityId)
    if (!entity) {
      throw new Error(`Entity "${input.entityId}" not found`)
    }
    const identities = this.parseJson<Array<Record<string, unknown>>>(entity.channelIdentities, [])
    const dedupKey = `${input.channelType}:${input.externalId}`
    const filtered = identities.filter((entry) => `${entry.channelType}:${entry.externalId}` !== dedupKey)
    filtered.push({
      channelType: input.channelType,
      externalId: input.externalId,
      displayName: input.displayName,
      confidence: input.confidence,
      status: input.confidence >= 0.9 ? 'confirmed' : 'pending_review'
    })
    entity.channelIdentities = JSON.stringify(filtered)
    entity.updatedAt = Date.now()
    const db = await this.entitiesDbPromise
    await upsert(db, entity)
    await this.persistEntities()
    return this.fromEntityDoc(entity)
  }

  async getTopFactsForPrompt(query: string, limit: number): Promise<FactNode[]> {
    const hits = await this.queryFacts({
      query: query.trim() || 'latest user context',
      limit: Math.max(1, Math.min(25, limit)),
      includeArchived: false
    })
    return hits
      .sort((a, b) => (b.fact.priority + b.score) - (a.fact.priority + a.score))
      .slice(0, limit)
      .map((hit) => hit.fact)
  }

  private async upsertEntity(input: { entityType: string; label: string }): Promise<EntityNode> {
    const db = await this.entitiesDbPromise
    const label = input.label.trim()
    const existing = await search(db, {
      term: label,
      where: { entityType: input.entityType, mergedInto: '' },
      limit: 1
    })
    const hit = existing.hits[0]
    if (hit) return this.fromEntityDoc(hit.document as EntityDoc)

    const now = Date.now()
    const doc: EntityDoc = {
      entityId: crypto.randomUUID(),
      entityType: input.entityType,
      labels: label,
      aliases: '',
      channelIdentities: '[]',
      mergedInto: '',
      labelEmbedding: (await this.safeEmbedding(label)) ?? this.emptyVector(),
      createdAt: now,
      updatedAt: now
    }
    await insert(db, doc)
    await this.persistEntities()
    return this.fromEntityDoc(doc)
  }

  private async getFactById(factId: string): Promise<FactDoc | null> {
    const db = await this.factsDbPromise
    const result = await search(db, {
      term: '',
      where: { factId },
      limit: 1
    })
    return (result.hits[0]?.document as FactDoc | undefined) ?? null
  }

  private async getEntityById(entityId: string): Promise<EntityDoc | null> {
    const db = await this.entitiesDbPromise
    const result = await search(db, {
      term: '',
      where: { entityId },
      limit: 1
    })
    return (result.hits[0]?.document as EntityDoc | undefined) ?? null
  }

  private async ready(): Promise<void> {
    await this.readyPromise
  }

  private async loadFromDisk(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
    await Promise.all([
      this.loadDb(this.messagesDbPromise, this.messageDbPath),
      this.loadDb(this.entitiesDbPromise, this.entityDbPath),
      this.loadDb(this.factsDbPromise, this.factDbPath)
    ])
  }

  private async loadDb(dbPromise: Promise<unknown>, filePath: string): Promise<void> {
    if (!existsSync(filePath)) return
    try {
      const content = await readFile(filePath, 'utf8')
      if (!content.trim()) return
      const raw = JSON.parse(content)
      load(await dbPromise, raw)
    } catch (error) {
      console.warn('[memory] failed to load persisted Orama DB:', filePath, error)
    }
  }

  private async persistMessages(): Promise<void> {
    await this.persistDb(this.messagesDbPromise, this.messageDbPath)
  }

  private async persistEntities(): Promise<void> {
    await this.persistDb(this.entitiesDbPromise, this.entityDbPath)
  }

  private async persistFacts(): Promise<void> {
    await this.persistDb(this.factsDbPromise, this.factDbPath)
  }

  private async persistDb(dbPromise: Promise<unknown>, filePath: string): Promise<void> {
    const serialized = save(await dbPromise)
    await writeFile(filePath, JSON.stringify(serialized), 'utf8')
  }

  private async toMessageDoc(message: MessageMemoryDocument): Promise<MessageDoc> {
    const hash = this.hashText(message.content)
    return {
      ...message,
      contentHash: hash,
      contentEmbedding: (await this.safeEmbedding(message.content)) ?? this.emptyVector()
    }
  }

  private fromMessageDoc(doc: MessageDoc): MessageMemoryDocument {
    return {
      messageId: doc.messageId,
      chatId: doc.chatId,
      threadId: doc.threadId,
      role: doc.role,
      content: doc.content,
      chatTitle: doc.chatTitle,
      senderName: doc.senderName,
      channelType: doc.channelType,
      channelExternalId: doc.channelExternalId,
      timestamp: doc.timestamp
    }
  }

  private fromEntityDoc(doc: EntityDoc): EntityNode {
    return {
      entityId: doc.entityId,
      entityType: doc.entityType as EntityNode['entityType'],
      labels: doc.labels,
      aliases: this.parseAliases(doc.aliases),
      channelIdentities: this.parseJson(doc.channelIdentities, []),
      mergedInto: doc.mergedInto || undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }
  }

  private fromFactDoc(doc: FactDoc): FactNode {
    return {
      factId: doc.factId,
      statement: doc.statement,
      factType: doc.factType,
      confidence: doc.confidence,
      priority: doc.priority,
      recency: doc.recency,
      entityRefs: this.parseJson(doc.entityRefs, []),
      sourceMessageIds: this.parseJson(doc.sourceMessageIds, []),
      isArchived: doc.isArchived,
      supersededBy: doc.supersededBy || undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }
  }

  private parseAliases(value: string): string[] {
    return value
      .split(' ')
      .map((part) => part.trim())
      .filter(Boolean)
  }

  private parseJson<T>(value: string, fallback: T): T {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }

  private hashText(text: string): string {
    return createHash('sha256').update(text).digest('hex')
  }

  private async safeEmbedding(text: string): Promise<number[] | null> {
    const normalized = text.trim()
    if (!normalized) return null
    try {
      const vector = await this.embeddingFn(normalized)
      if (!Array.isArray(vector) || vector.length === 0) return null
      if (vector.length === EMBEDDING_DIM) return vector
      if (vector.length > EMBEDDING_DIM) return vector.slice(0, EMBEDDING_DIM)
      return vector.concat(Array.from({ length: EMBEDDING_DIM - vector.length }, () => 0))
    } catch (error) {
      console.warn('[memory] embedding generation failed:', error)
      return null
    }
  }

  private emptyVector(): number[] {
    return Array.from({ length: EMBEDDING_DIM }, () => 0)
  }

  private createMessageDb() {
    return create({
      schema: {
        messageId: 'string',
        chatId: 'string',
        threadId: 'string',
        role: 'string',
        content: 'string',
        chatTitle: 'string',
        senderName: 'string',
        channelType: 'string',
        channelExternalId: 'string',
        contentEmbedding: 'vector[1536]',
        contentHash: 'string',
        timestamp: 'number'
      }
    })
  }

  private createEntityDb() {
    return create({
      schema: {
        entityId: 'string',
        entityType: 'string',
        labels: 'string',
        aliases: 'string',
        channelIdentities: 'string',
        mergedInto: 'string',
        labelEmbedding: 'vector[1536]',
        createdAt: 'number',
        updatedAt: 'number'
      }
    })
  }

  private createFactDb() {
    return create({
      schema: {
        factId: 'string',
        statement: 'string',
        factType: 'string',
        confidence: 'number',
        priority: 'number',
        recency: 'number',
        entityRefs: 'string',
        sourceMessageIds: 'string',
        isArchived: 'boolean',
        supersededBy: 'string',
        statementEmbedding: 'vector[1536]',
        contentHash: 'string',
        createdAt: 'number',
        updatedAt: 'number'
      }
    })
  }
}
