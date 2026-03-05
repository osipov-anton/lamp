import type {
  FactNode,
  MemoryGraphPort,
  MemoryQueryOptions,
  MessageMemoryDocument,
  UpsertFactInput
} from '../../storage/ports/MemoryGraphPort'

export class MemoryGraphService {
  constructor(private readonly memory: MemoryGraphPort) {}

  async indexMessage(message: MessageMemoryDocument): Promise<void> {
    await this.memory.upsertMessage(message)
  }

  async queryFacts(options: MemoryQueryOptions): Promise<FactNode[]> {
    const hits = await this.memory.queryFacts(options)
    return hits.map((hit) => hit.fact)
  }

  async upsertFact(input: UpsertFactInput): Promise<FactNode> {
    return this.memory.upsertFact(input)
  }

  async archiveFacts(factIds: string[], reason: string): Promise<number> {
    return this.memory.archiveFacts(factIds, reason)
  }
}
