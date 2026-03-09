import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Search, MessageCircle, Send, List, Users } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import type { ToolCallState } from '@renderer/types'

interface ToolCallCardProps {
  toolCall: ToolCallState
}

const TOOL_ICONS: Record<string, typeof Search> = {
  web_search: Search,
  telegram_list_chats: List,
  telegram_list_contacts: Users,
  telegram_read_messages: MessageCircle,
  telegram_send_message: Send,
  telegram_search_messages: Search
}

function StatusIcon({ status }: { status: ToolCallState['status'] }) {
  switch (status) {
    case 'queued':
    case 'started':
    case 'progress':
    case 'partial_output':
      return <Loader2 className="size-3.5 animate-spin text-foreground/50" />
    case 'completed':
      return <CheckCircle2 className="size-3.5 text-emerald-500" />
    case 'failed':
      return <XCircle className="size-3.5 text-destructive" />
    case 'cancelled':
      return <XCircle className="size-3.5 text-muted-foreground" />
  }
}

function isTerminal(status: ToolCallState['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const hasFailed = toolCall.status === 'failed'
  const [expanded, setExpanded] = useState(hasFailed)
  const Icon = TOOL_ICONS[toolCall.toolId]
  const terminal = isTerminal(toolCall.status)

  return (
    <div
      className={cn(
        'rounded-lg border text-sm transition-colors',
        hasFailed
          ? 'border-destructive/40 bg-destructive/5'
          : terminal
            ? 'border-border/30 bg-muted/20'
            : 'border-white/10 bg-[#1A1A1A] shadow-sm shadow-black/10'
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full min-h-10 px-3 py-2 text-left"
      >
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}

        {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}

        <span className="font-medium truncate">
          {toolCall.toolName || toolCall.toolId}
        </span>

        <span className="ml-auto flex min-w-[210px] items-center justify-end gap-1.5 shrink-0">
          <span className="text-xs text-muted-foreground truncate max-w-[180px]">
            {toolCall.statusText ?? '\u00a0'}
          </span>
          <StatusIcon status={toolCall.status} />
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-2.5 pt-0.5 space-y-1.5 border-t border-border/30">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Status: {toolCall.status}</span>
            {toolCall.agentId && <span>Agent: {toolCall.agentId}</span>}
            {toolCall.elapsedMs > 0 && (
              <span>{(toolCall.elapsedMs / 1000).toFixed(1)}s</span>
            )}
            {toolCall.percent !== undefined && (
              <span>{toolCall.percent}%</span>
            )}
          </div>

          {toolCall.preview && (
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words bg-background/50 rounded p-2 max-h-40 overflow-y-auto">
              {toolCall.preview}
            </pre>
          )}

          {toolCall.result?.error && (
            <pre className="text-xs text-destructive whitespace-pre-wrap break-words bg-destructive/10 rounded p-2 max-h-56 overflow-y-auto">
              {toolCall.result.error}
            </pre>
          )}

          {toolCall.toolId === 'memory_query' && toolCall.result?.memoryQueryHits && toolCall.result.memoryQueryHits.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-foreground/80">
                Returned facts: {toolCall.result.memoryQueryHits.length}
              </div>
              <div className="space-y-1.5">
                {toolCall.result.memoryQueryHits.map((hit) => (
                  <div key={hit.factId} className="rounded-md bg-background/50 p-2 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{hit.factType || 'fact'}</span>
                      <span>score={hit.score.toFixed(3)}</span>
                      {hit.source === 'related' && <span>related</span>}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap break-words text-foreground/90">
                      {hit.statement}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {toolCall.result?.content && toolCall.toolId !== 'memory_query' && (
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words bg-background/50 rounded p-2 max-h-56 overflow-y-auto">
              {toolCall.result.content}
            </pre>
          )}
        </div>
      )}

      <div className="h-0.5 bg-muted overflow-hidden rounded-b-lg">
        <div
          className={cn(
            'h-full transition-all duration-300',
            !terminal && toolCall.percent !== undefined
              ? 'bg-foreground/40 opacity-100'
              : 'bg-foreground/40 opacity-0'
          )}
          style={{ width: `${toolCall.percent ?? 0}%` }}
        />
      </div>
    </div>
  )
}
