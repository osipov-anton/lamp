import type { FactNode } from '../../storage/ports/MemoryGraphPort'

export class RelevanceScoringService {
  scoreFact(fact: FactNode, query: string): number {
    const now = Date.now()
    const ageMs = Math.max(1, now - fact.recency)
    const recencyScore = 1 / (1 + ageMs / (1000 * 60 * 60 * 24 * 7))
    const confidenceScore = Math.max(0, Math.min(1, fact.confidence))
    const queryScore = this.queryMatchScore(fact.statement, query)
    return fact.priority * 0.3 + recencyScore * 0.3 + confidenceScore * 0.2 + queryScore * 0.2
  }

  private queryMatchScore(statement: string, query: string): number {
    const s = statement.toLowerCase()
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean)
    if (terms.length === 0) return 0.5
    const matches = terms.filter((term) => s.includes(term)).length
    return matches / terms.length
  }
}
