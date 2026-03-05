export type MemoryEntityType =
  | 'person'
  | 'project'
  | 'task'
  | 'org'
  | 'tool'
  | 'topic'
  | 'channel_account'
  | 'chat'

export interface MessageMemoryDocument {
  messageId: string
  chatId: string
  threadId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  chatTitle: string
  senderName: string
  channelType: 'telegram' | 'local_chat' | 'email' | 'whatsapp'
  channelExternalId: string
  timestamp: number
}

export interface MemoryChannelIdentity {
  channelType: 'telegram' | 'email' | 'whatsapp' | 'local_chat'
  externalId: string
  displayName: string
  confidence: number
  status: 'confirmed' | 'pending_review'
}

export interface EntityNode {
  entityId: string
  entityType: MemoryEntityType
  labels: string
  aliases: string[]
  channelIdentities: MemoryChannelIdentity[]
  mergedInto?: string
  createdAt: number
  updatedAt: number
}

export interface FactEntityRef {
  entityId: string
  entityType: MemoryEntityType
  label: string
  role: 'about' | 'owns' | 'prefers' | 'blocked_by' | 'works_on'
}

export interface FactNode {
  factId: string
  statement: string
  factType: string
  confidence: number
  priority: number
  recency: number
  entityRefs: FactEntityRef[]
  sourceMessageIds: Array<{ messageId: string; chatId: string }>
  isArchived: boolean
  supersededBy?: string
  createdAt: number
  updatedAt: number
}

export interface FactSearchHit {
  score: number
  fact: FactNode
}

export interface MessageSearchHit {
  score: number
  message: MessageMemoryDocument
}

export interface MemoryQueryOptions {
  query: string
  limit?: number
  includeArchived?: boolean
  factType?: string
  entityType?: MemoryEntityType
  includeSourceMessages?: boolean
}

export interface UpsertFactInput {
  factId?: string
  statement: string
  factType: string
  confidence: number
  priority?: number
  recency?: number
  entityRefs: Array<
    Partial<Pick<FactEntityRef, 'entityId'>> &
      Pick<FactEntityRef, 'entityType' | 'label' | 'role'>
  >
  supersedes?: string
  sourceMessageIds: Array<{ messageId: string; chatId: string }>
}

export interface MemoryGraphPort {
  rebuildMessages(messages: MessageMemoryDocument[]): Promise<void>
  upsertMessage(message: MessageMemoryDocument): Promise<void>
  searchMessages(query: string, options?: { limit?: number; chatId?: string; role?: string }): Promise<MessageSearchHit[]>
  getMessageById(messageId: string): Promise<MessageMemoryDocument | null>
  ensureEntity(input: { entityId?: string; entityType: MemoryEntityType; label: string }): Promise<EntityNode>

  queryFacts(options: MemoryQueryOptions): Promise<FactSearchHit[]>
  upsertFact(input: UpsertFactInput): Promise<FactNode>
  archiveFacts(factIds: string[], reason: string): Promise<number>
  mergeEntities(keepEntityId: string, mergeEntityId: string, reason: string): Promise<void>
  linkIdentity(input: {
    entityId: string
    channelType: MemoryChannelIdentity['channelType']
    externalId: string
    displayName: string
    confidence: number
  }): Promise<EntityNode>
  getTopFactsForPrompt(query: string, limit: number): Promise<FactNode[]>
}
