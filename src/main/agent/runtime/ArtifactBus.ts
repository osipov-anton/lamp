import type { ArtifactBusEvent, ArtifactBusListener } from './types'

export class ArtifactBus {
  private listeners = new Set<ArtifactBusListener>()

  subscribe(listener: ArtifactBusListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(event: ArtifactBusEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // listeners must not break the bus
      }
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}
