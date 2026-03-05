import type { ModelProvider } from './ModelProvider'

export class ProviderRegistry {
  private providers = new Map<string, ModelProvider>()

  register(provider: ModelProvider): void {
    this.providers.set(provider.id, provider)
  }

  get(id: string): ModelProvider | undefined {
    return this.providers.get(id)
  }

  getOrThrow(id: string): ModelProvider {
    const provider = this.providers.get(id)
    if (!provider) {
      throw new Error(`Provider "${id}" is not registered`)
    }
    return provider
  }

  has(id: string): boolean {
    return this.providers.has(id)
  }

  getAll(): ModelProvider[] {
    return Array.from(this.providers.values())
  }
}
