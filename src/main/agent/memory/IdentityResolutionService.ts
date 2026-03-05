import type { MemoryGraphPort } from '../../storage/ports/MemoryGraphPort'

export interface ResolveIdentityInput {
  chatId: string
  channelType: 'telegram' | 'email' | 'whatsapp' | 'local_chat'
  externalId?: string
  displayName: string
}

export class IdentityResolutionService {
  constructor(private readonly memory: MemoryGraphPort) {}

  async resolveAnchorEntity(input: ResolveIdentityInput): Promise<string> {
    const fallbackEntityId = `chat:${input.chatId}`
    const entity = await this.memory.ensureEntity({
      entityId: fallbackEntityId,
      entityType: 'chat',
      label: `Chat ${input.chatId}`
    })
    if (!input.externalId) {
      return entity.entityId
    }

    try {
      const linked = await this.memory.linkIdentity({
        entityId: entity.entityId,
        channelType: input.channelType,
        externalId: input.externalId,
        displayName: input.displayName,
        confidence: 0.9
      })
      return linked.entityId
    } catch {
      return entity.entityId
    }
  }
}
