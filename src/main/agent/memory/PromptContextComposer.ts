import type { MemoryGraphPort } from '../../storage/ports/MemoryGraphPort'
import { RelevanceScoringService } from './RelevanceScoringService'

export class PromptContextComposer {
  private scoring = new RelevanceScoringService()

  constructor(private readonly memory: MemoryGraphPort) {}

  async compose(query: string, limit = 8, maxChars = 2000): Promise<string> {
    const facts = await this.memory.getTopFactsForPrompt(query, limit * 2)
    if (facts.length === 0) return ''

    const ranked = facts
      .map((fact) => ({ fact, score: this.scoring.scoreFact(fact, query) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    const lines: string[] = []
    for (const { fact, score } of ranked) {
      lines.push(
        `- (${fact.factType}, conf=${fact.confidence.toFixed(2)}, score=${score.toFixed(2)}) ${fact.statement}`
      )
      if (lines.join('\n').length > maxChars) {
        break
      }
    }
    if (lines.length === 0) return ''
    return `MemoryContext:\n${lines.join('\n')}`
  }
}
