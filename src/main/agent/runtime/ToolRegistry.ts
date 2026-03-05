import type { ToolDefinition, ToolSchema } from './types'

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()

  register(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool)
  }

  get(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId)
  }

  has(toolId: string): boolean {
    return this.tools.has(toolId)
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  getSchemas(toolIds?: string[]): ToolSchema[] {
    const defs = toolIds
      ? toolIds.map((id) => this.tools.get(id)).filter(Boolean) as ToolDefinition[]
      : this.getAll()

    return defs.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }))
  }
}
