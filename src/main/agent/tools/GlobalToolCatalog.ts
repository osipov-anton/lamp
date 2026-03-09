import type { ToolDefinition } from '../runtime/types'
import { ToolRegistry } from '../runtime/ToolRegistry'
import type { AgentToolPolicy } from './policies/AgentToolPolicy'
import { isToolAllowed } from './policies/AgentToolPolicy'

export class GlobalToolCatalog {
  private registry = new ToolRegistry()

  register(tool: ToolDefinition): void {
    this.registry.register(tool)
  }

  unregister(toolId: string): void {
    this.registry.unregister(toolId)
  }

  get(toolId: string): ToolDefinition | undefined {
    return this.registry.get(toolId)
  }

  has(toolId: string): boolean {
    return this.registry.has(toolId)
  }

  getAll(): ToolDefinition[] {
    return this.registry.getAll()
  }

  /**
   * Build a scoped ToolRegistry that only contains tools
   * permitted by the given policy.
   */
  createScopedRegistry(policy: AgentToolPolicy): ToolRegistry {
    const scoped = new ToolRegistry()
    for (const tool of this.registry.getAll()) {
      if (isToolAllowed(policy, tool.id)) {
        scoped.register(tool)
      }
    }
    return scoped
  }
}
