import { useCallback, useEffect, useState } from 'react'
import { Bot, Plus, Pencil, Trash2, X, Check, Wand2 } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { ScrollArea } from './ui/scroll-area'
import { cn } from '@renderer/lib/utils'
import type { AgentPreset } from '@renderer/types'

interface AgentFormData {
  handle: string
  name: string
  prompt: string
}

const EMPTY_FORM: AgentFormData = { handle: '', name: '', prompt: '' }

function AgentCard({
  agent,
  onEdit,
  onDelete
}: {
  agent: AgentPreset
  onEdit: (agent: AgentPreset) => void
  onDelete: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="group rounded-xl border border-border/40 bg-background/40 p-5 backdrop-blur-sm transition-all duration-200 hover:border-border/80 hover:bg-background/60">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20">
            <Bot className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-sm truncate">{agent.name}</h3>
            <span className="text-xs text-muted-foreground/60 font-mono">@{agent.handle}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onEdit(agent)}
          >
            <Pencil className="size-3" />
          </Button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(agent.id)}
              >
                <Check className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                onClick={() => setConfirmDelete(false)}
              >
                <X className="size-3" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-3" />
            </Button>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground/70 leading-relaxed line-clamp-3">
        {agent.prompt}
      </p>
    </div>
  )
}

function AgentForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel
}: {
  initial: AgentFormData
  onSubmit: (data: AgentFormData) => void
  onCancel: () => void
  submitLabel: string
}) {
  const [form, setForm] = useState<AgentFormData>(initial)
  const [error, setError] = useState('')
  const [improving, setImproving] = useState(false)

  const handleImprovePrompt = async () => {
    if (!form.prompt.trim() || improving) return
    setImproving(true)
    setError('')
    try {
      const improved = await window.api.agentPresets.improvePrompt(form.prompt)
      setForm((prev) => ({ ...prev, prompt: improved }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to improve prompt')
    } finally {
      setImproving(false)
    }
  }

  const handleSubmit = () => {
    const handle = form.handle.toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!handle) {
      setError('Handle is required')
      return
    }
    if (!form.name.trim()) {
      setError('Name is required')
      return
    }
    if (!form.prompt.trim()) {
      setError('Prompt is required')
      return
    }
    setError('')
    onSubmit({ ...form, handle })
  }

  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-5 backdrop-blur-sm space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Handle
          </label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 text-sm">
              @
            </span>
            <Input
              value={form.handle}
              onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
              placeholder="translator"
              className="h-9 pl-7 text-sm bg-background/80 font-mono"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Name
          </label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Translator"
            className="h-9 text-sm bg-background/80"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            System prompt
          </label>
          <button
            type="button"
            onClick={handleImprovePrompt}
            disabled={!form.prompt.trim() || improving}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-all',
              form.prompt.trim() && !improving
                ? 'text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 cursor-pointer'
                : 'text-muted-foreground/30 cursor-not-allowed'
            )}
          >
            <Wand2 className={cn('size-3', improving && 'animate-pulse')} />
            {improving ? 'Improving...' : 'Improve'}
          </button>
        </div>
        <Textarea
          value={form.prompt}
          onChange={(e) => setForm({ ...form, prompt: e.target.value })}
          placeholder="You are a professional translator. Translate any text the user sends to English, preserving the original tone and style..."
          className="min-h-[120px] text-sm bg-background/80 resize-y"
          disabled={improving}
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}

export function AgentsView() {
  const [agents, setAgents] = useState<AgentPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentPreset | null>(null)
  const [formError, setFormError] = useState('')

  const loadAgents = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.agentPresets.list()
      setAgents(list)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  const handleCreate = async (data: AgentFormData) => {
    try {
      setFormError('')
      const created = await window.api.agentPresets.create(data)
      setAgents((prev) => [...prev, created])
      setShowForm(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create agent')
    }
  }

  const handleUpdate = async (data: AgentFormData) => {
    if (!editingAgent) return
    try {
      setFormError('')
      const updated = await window.api.agentPresets.update(editingAgent.id, data)
      if (updated) {
        setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      }
      setEditingAgent(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update agent')
    }
  }

  const handleDelete = async (id: string) => {
    await window.api.agentPresets.delete(id)
    setAgents((prev) => prev.filter((a) => a.id !== id))
  }

  const handleEdit = (agent: AgentPreset) => {
    setEditingAgent(agent)
    setShowForm(false)
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full bg-background overflow-hidden relative">
      <div className="absolute top-0 right-1/4 w-[40rem] h-[40rem] bg-violet-500/5 rounded-full blur-[8rem] pointer-events-none -translate-y-1/2" />
      <div className="absolute bottom-0 left-1/3 w-[30rem] h-[30rem] bg-cyan-500/5 rounded-full blur-[6rem] pointer-events-none translate-y-1/2" />

      <header className="flex-none px-8 pt-14 pb-4 border-b border-white/5 relative z-10 bg-background/40 backdrop-blur-2xl">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">Agents</h1>
              <span className="text-xs text-muted-foreground/60 tabular-nums">
                {agents.length} {agents.length === 1 ? 'agent' : 'agents'}
              </span>
            </div>
            {!showForm && !editingAgent && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setShowForm(true)}
              >
                <Plus className="size-3.5" />
                New Agent
              </Button>
            )}
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1 min-h-0 relative z-10">
        <div className="max-w-3xl mx-auto p-8 space-y-4">
          {formError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
              {formError}
            </div>
          )}

          {showForm && (
            <AgentForm
              initial={EMPTY_FORM}
              onSubmit={handleCreate}
              onCancel={() => {
                setShowForm(false)
                setFormError('')
              }}
              submitLabel="Create"
            />
          )}

          {editingAgent && (
            <AgentForm
              initial={{
                handle: editingAgent.handle,
                name: editingAgent.name,
                prompt: editingAgent.prompt
              }}
              onSubmit={handleUpdate}
              onCancel={() => {
                setEditingAgent(null)
                setFormError('')
              }}
              submitLabel="Save"
            />
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="size-8 rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60 animate-spin" />
              <p className="text-sm text-muted-foreground/50 mt-4">Loading agents...</p>
            </div>
          ) : agents.length === 0 && !showForm ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="size-14 rounded-2xl bg-muted/30 flex items-center justify-center mb-4 ring-1 ring-border/30">
                <Bot className="size-7 text-muted-foreground/30" />
              </div>
              <p className="text-sm font-medium text-foreground/70">No agents yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm text-center">
                Create an agent with a custom prompt. Start any message with @handle to activate it.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-4 gap-1.5"
                onClick={() => setShowForm(true)}
              >
                <Plus className="size-3.5" />
                Create your first agent
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
