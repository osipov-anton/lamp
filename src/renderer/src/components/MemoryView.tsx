import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Brain,
  Search,
  Trash2,
  User,
  Briefcase,
  FolderKanban,
  Building2,
  Wrench,
  Hash,
  MessageCircle,
  UserCircle,
  RefreshCw,
  Archive
} from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { cn } from '@renderer/lib/utils'
import type { MemoryFact, MemoryEntity, MemoryEntityType } from '@renderer/types'

type TabId = 'facts' | 'entities'

const ENTITY_TYPE_META: Record<MemoryEntityType, { icon: typeof User; label: string; color: string }> = {
  person: { icon: User, label: 'Person', color: 'text-blue-400 bg-blue-500/10 ring-blue-500/20' },
  project: { icon: FolderKanban, label: 'Project', color: 'text-violet-400 bg-violet-500/10 ring-violet-500/20' },
  task: { icon: Hash, label: 'Task', color: 'text-amber-400 bg-amber-500/10 ring-amber-500/20' },
  org: { icon: Building2, label: 'Organization', color: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/20' },
  tool: { icon: Wrench, label: 'Tool', color: 'text-orange-400 bg-orange-500/10 ring-orange-500/20' },
  topic: { icon: Hash, label: 'Topic', color: 'text-cyan-400 bg-cyan-500/10 ring-cyan-500/20' },
  channel_account: { icon: UserCircle, label: 'Account', color: 'text-pink-400 bg-pink-500/10 ring-pink-500/20' },
  chat: { icon: MessageCircle, label: 'Chat', color: 'text-indigo-400 bg-indigo-500/10 ring-indigo-500/20' }
}

function EntityTypeBadge({ type }: { type: MemoryEntityType }) {
  const meta = ENTITY_TYPE_META[type] ?? ENTITY_TYPE_META.topic
  const Icon = meta.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1', meta.color)}>
      <Icon className="size-3" />
      {meta.label}
    </span>
  )
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted/50 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  )
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function FactCard({
  fact,
  onDelete
}: {
  fact: MemoryFact
  onDelete: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="group relative rounded-xl border border-border/40 bg-background/40 p-4 backdrop-blur-sm transition-all duration-200 hover:border-border/80 hover:bg-background/60">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-foreground/90 leading-relaxed flex-1">{fact.statement}</p>
        <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(fact.factId)}
              >
                <Trash2 className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                onClick={() => setConfirmDelete(false)}
              >
                ✕
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border/50">
          {fact.factType}
        </span>
        {fact.entityRefs.map((ref, i) => (
          <EntityTypeBadge key={`${ref.entityId}-${i}`} type={ref.entityType} />
        ))}
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ConfidenceBar value={fact.confidence} />
          {fact.entityRefs.length > 0 && (
            <span className="text-[10px] text-muted-foreground/60">
              {fact.entityRefs.map((r) => r.label).join(', ')}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground/50">{timeAgo(fact.updatedAt)}</span>
      </div>
    </div>
  )
}

function EntityCard({
  entity,
  onDelete
}: {
  entity: MemoryEntity
  onDelete: (id: string) => void
}) {
  const meta = ENTITY_TYPE_META[entity.entityType] ?? ENTITY_TYPE_META.topic
  const Icon = meta.icon
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="group rounded-xl border border-border/40 bg-background/40 p-4 backdrop-blur-sm transition-all duration-200 hover:border-border/80 hover:bg-background/60">
      <div className="flex items-start justify-between gap-3">
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl ring-1', meta.color)}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-sm truncate">{entity.labels}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <EntityTypeBadge type={entity.entityType} />
            <span className="text-[10px] text-muted-foreground/50">{timeAgo(entity.updatedAt)}</span>
          </div>
          {entity.aliases.length > 0 && (
            <p className="text-[11px] text-muted-foreground/60 mt-1.5 truncate">
              aka {entity.aliases.join(', ')}
            </p>
          )}
          {entity.channelIdentities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {entity.channelIdentities.map((ci, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-border/30"
                >
                  {ci.channelType}: {ci.displayName}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(entity.entityId)}
              >
                <Trash2 className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                onClick={() => setConfirmDelete(false)}
              >
                ✕
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
    </div>
  )
}

export function MemoryView() {
  const [activeTab, setActiveTab] = useState<TabId>('facts')
  const [facts, setFacts] = useState<MemoryFact[]>([])
  const [entities, setEntities] = useState<MemoryEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [pendingBulkDelete, setPendingBulkDelete] = useState<TabId | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [f, e] = await Promise.all([
        window.api.memory.listFacts({ includeArchived: showArchived }),
        window.api.memory.listEntities()
      ])
      setFacts(f)
      setEntities(e)
    } finally {
      setLoading(false)
    }
  }, [showArchived])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDeleteFact = useCallback(
    async (factId: string) => {
      const deleted = await window.api.memory.deleteFact(factId)
      if (deleted) setFacts((prev) => prev.filter((f) => f.factId !== factId))
    },
    []
  )

  const handleDeleteEntity = useCallback(
    async (entityId: string) => {
      const deleted = await window.api.memory.deleteEntity(entityId)
      if (deleted) await loadData()
    },
    [loadData]
  )

  const factTypes = useMemo(() => {
    const types = new Set(facts.map((f) => f.factType))
    return Array.from(types).sort()
  }, [facts])

  const filteredFacts = useMemo(() => {
    let result = facts
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (f) =>
          f.statement.toLowerCase().includes(q) ||
          f.entityRefs.some((r) => r.label.toLowerCase().includes(q))
      )
    }
    if (typeFilter) {
      result = result.filter((f) => f.factType === typeFilter)
    }
    return result.sort((a, b) => b.updatedAt - a.updatedAt)
  }, [facts, searchQuery, typeFilter])

  const filteredEntities = useMemo(() => {
    if (!searchQuery.trim()) return entities.sort((a, b) => b.updatedAt - a.updatedAt)
    const q = searchQuery.toLowerCase()
    return entities
      .filter(
        (e) =>
          e.labels.toLowerCase().includes(q) ||
          e.aliases.some((a) => a.toLowerCase().includes(q)) ||
          e.entityType.toLowerCase().includes(q)
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [entities, searchQuery])

  const entityTypeGroups = useMemo(() => {
    const groups = new Map<MemoryEntityType, MemoryEntity[]>()
    for (const entity of filteredEntities) {
      const list = groups.get(entity.entityType) ?? []
      list.push(entity)
      groups.set(entity.entityType, list)
    }
    return groups
  }, [filteredEntities])

  const visibleItemCount = activeTab === 'facts' ? filteredFacts.length : filteredEntities.length

  const handleDeleteVisible = useCallback(async () => {
    setBulkDeleting(true)
    try {
      if (activeTab === 'facts') {
        const results = await Promise.all(filteredFacts.map((fact) => window.api.memory.deleteFact(fact.factId)))
        if (results.some(Boolean)) {
          await loadData()
        }
      } else {
        const results = await Promise.all(
          filteredEntities.map((entity) => window.api.memory.deleteEntity(entity.entityId))
        )
        if (results.some(Boolean)) {
          await loadData()
        }
      }
    } finally {
      setBulkDeleting(false)
      setPendingBulkDelete(null)
    }
  }, [activeTab, filteredEntities, filteredFacts, loadData])

  useEffect(() => {
    setPendingBulkDelete(null)
  }, [activeTab, searchQuery, showArchived, typeFilter])

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full bg-background overflow-hidden relative">
      <div className="absolute top-0 right-1/4 w-[40rem] h-[40rem] bg-violet-500/5 rounded-full blur-[8rem] pointer-events-none -translate-y-1/2" />
      <div className="absolute bottom-0 left-1/3 w-[30rem] h-[30rem] bg-cyan-500/5 rounded-full blur-[6rem] pointer-events-none translate-y-1/2" />

      <header className="flex-none px-8 pt-14 pb-4 border-b border-white/5 relative z-10 bg-background/40 backdrop-blur-2xl">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">Memory</h1>
              <span className="text-xs text-muted-foreground/60 tabular-nums">
                {facts.length} facts · {entities.length} entities
              </span>
            </div>
            <button
              className="text-muted-foreground/50 hover:text-foreground transition-colors p-1"
              onClick={loadData}
              disabled={loading}
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="h-8 pl-8 text-xs bg-background/80"
              />
            </div>

            <div className="flex items-center rounded-md bg-muted/30 p-0.5 ring-1 ring-border/20">
              {(['facts', 'entities'] as const).map((tab) => (
                <button
                  key={tab}
                  className={cn(
                    'px-2.5 py-1 rounded text-[11px] font-medium transition-all capitalize',
                    activeTab === tab
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === 'facts' && (
              <>
                {factTypes.length > 1 && (
                  <select
                    value={typeFilter ?? ''}
                    onChange={(e) => setTypeFilter(e.target.value || null)}
                    className="h-8 rounded-md bg-background/80 border border-border/30 px-2 text-[11px] text-muted-foreground focus:text-foreground outline-none cursor-pointer"
                  >
                    <option value="">All types</option>
                    {factTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                )}

                <button
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                    showArchived
                      ? 'bg-foreground/10 text-foreground'
                      : 'text-muted-foreground/50 hover:text-foreground'
                  )}
                  onClick={() => setShowArchived(!showArchived)}
                >
                  <Archive className="size-3 inline mr-1" />
                  Archived
                </button>
              </>
            )}

            {visibleItemCount > 0 &&
              (pendingBulkDelete === activeTab ? (
                <>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={handleDeleteVisible}
                    disabled={bulkDeleting}
                  >
                    {bulkDeleting ? <RefreshCw className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                    {bulkDeleting
                      ? 'Deleting...'
                      : activeTab === 'facts'
                        ? `Confirm delete ${visibleItemCount} facts`
                        : `Confirm delete ${visibleItemCount} entities`}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-muted-foreground"
                    onClick={() => setPendingBulkDelete(null)}
                    disabled={bulkDeleting}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setPendingBulkDelete(activeTab)}
                  disabled={loading || bulkDeleting}
                >
                  <Trash2 className="size-3" />
                  {activeTab === 'facts' ? 'Delete visible facts' : 'Delete visible entities'}
                </Button>
              ))}
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1 min-h-0 relative z-10">
        <div className="max-w-5xl mx-auto p-10">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <RefreshCw className="size-8 text-muted-foreground/30 animate-spin" />
              <p className="text-sm text-muted-foreground/50 mt-4">Loading memory...</p>
            </div>
          ) : activeTab === 'facts' ? (
            filteredFacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="size-14 rounded-2xl bg-muted/30 flex items-center justify-center mb-4 ring-1 ring-border/30">
                  <Brain className="size-7 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-medium text-foreground/70">
                  {searchQuery ? 'No matching facts' : 'No facts yet'}
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm text-center">
                  {searchQuery
                    ? 'Try a different search query.'
                    : 'Start chatting and Lamp will automatically learn and remember important facts.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredFacts.map((fact) => (
                  <FactCard key={fact.factId} fact={fact} onDelete={handleDeleteFact} />
                ))}
              </div>
            )
          ) : filteredEntities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="size-14 rounded-2xl bg-muted/30 flex items-center justify-center mb-4 ring-1 ring-border/30">
                <User className="size-7 text-muted-foreground/30" />
              </div>
              <p className="text-sm font-medium text-foreground/70">
                {searchQuery ? 'No matching entities' : 'No entities yet'}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm text-center">
                {searchQuery
                  ? 'Try a different search query.'
                  : 'Entities like people, projects, and topics are created automatically as you chat.'}
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {Array.from(entityTypeGroups.entries()).map(([type, group]) => {
                const meta = ENTITY_TYPE_META[type] ?? ENTITY_TYPE_META.topic
                return (
                  <section key={type}>
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                        {meta.label}s
                      </h3>
                      <span className="text-[10px] text-muted-foreground/40 tabular-nums">{group.length}</span>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2">
                      {group.map((entity) => (
                        <EntityCard key={entity.entityId} entity={entity} onDelete={handleDeleteEntity} />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
