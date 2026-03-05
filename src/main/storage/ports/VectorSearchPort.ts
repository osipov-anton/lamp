export interface VectorDocument {
  id: string
  content: string
  metadata: Record<string, unknown>
  embedding?: number[]
}

export interface VectorSearchResult {
  id: string
  score: number
  document: VectorDocument
}

export interface VectorSearchOptions {
  limit?: number
  filter?: Record<string, unknown>
}

/**
 * Engine-agnostic vector search port.
 * Will be backed by Orama (or another engine) in a future phase.
 */
export interface VectorSearchPort {
  clear(): Promise<void>
  index(documents: VectorDocument[]): Promise<void>
  search(query: string, options?: VectorSearchOptions): Promise<VectorSearchResult[]>
  deleteByRunId(runId: string): Promise<void>
}
