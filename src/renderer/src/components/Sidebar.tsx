import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2, Settings, MessageSquare, Blocks, Search, Brain, Bot } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { Kbd } from './CommandPalette'
import { cn } from '@renderer/lib/utils'
import type { Chat } from '@renderer/types'

interface ChatGroup {
  label: string
  chats: Chat[]
}

function groupChatsByDate(chats: Chat[]): ChatGroup[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86_400_000
  const weekStart = todayStart - 7 * 86_400_000
  const monthStart = todayStart - 30 * 86_400_000

  const groups: Record<string, Chat[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 Days': [],
    'Previous 30 Days': [],
    Older: []
  }

  for (const chat of chats) {
    const t = chat.updatedAt
    if (t >= todayStart) groups['Today'].push(chat)
    else if (t >= yesterdayStart) groups['Yesterday'].push(chat)
    else if (t >= weekStart) groups['Previous 7 Days'].push(chat)
    else if (t >= monthStart) groups['Previous 30 Days'].push(chat)
    else groups['Older'].push(chat)
  }

  return Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, chats: list }))
}

interface SidebarProps {
  chats: Chat[]
  activeChatId: string | null
  currentView?: 'chat' | 'integrations' | 'memory' | 'agents'
  onSelectChat: (id: string) => void
  onNewChat: () => void
  onDeleteChat: (id: string) => void
  onOpenSettings: () => void
  onOpenIntegrations: () => void
  onOpenMemory: () => void
  onOpenAgents: () => void
}

export function Sidebar({
  chats,
  activeChatId,
  currentView = 'chat',
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onOpenSettings,
  onOpenIntegrations,
  onOpenMemory,
  onOpenAgents
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const chatItemRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const filteredChats = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return chats
    return chats.filter((chat) => (chat.title || 'New Chat').toLowerCase().includes(query))
  }, [chats, searchQuery])

  const chatGroups = useMemo(() => groupChatsByDate(filteredChats), [filteredChats])

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false
      const tagName = target.tagName.toLowerCase()
      return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select'
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      if (isTypingTarget(event.target) || filteredChats.length === 0) return

      const activeIndex = filteredChats.findIndex((chat) => chat.id === activeChatId)
      const fallbackIndex = event.key === 'ArrowDown' ? -1 : filteredChats.length
      const baseIndex = activeIndex >= 0 ? activeIndex : fallbackIndex
      const nextIndex =
        event.key === 'ArrowDown'
          ? Math.min(baseIndex + 1, filteredChats.length - 1)
          : Math.max(baseIndex - 1, 0)
      const nextChatId = filteredChats[nextIndex]?.id

      if (!nextChatId || nextChatId === activeChatId) return

      event.preventDefault()
      onSelectChat(nextChatId)
      requestAnimationFrame(() => {
        chatItemRefs.current.get(nextChatId)?.scrollIntoView({ block: 'nearest' })
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeChatId, filteredChats, onSelectChat])

  return (
    <div className="relative flex min-h-0 flex-col h-full w-[280px] shrink-0 bg-sidebar border-r border-sidebar-border/60 transition-colors duration-300 overflow-hidden">
      {/* Lamp Effect */}
      <div className="pointer-events-none absolute left-1/2 top-[-150px] h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-white/15 blur-[60px] z-0" />

      <div className="h-[52px] shrink-0 drag-region flex items-center pl-[76px] pr-3 justify-between relative z-10">
        <div className="flex items-baseline select-none cursor-default opacity-90 hover:opacity-100 transition-opacity">
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            Lamp AI
          </span>
          <span 
            className="text-amber-400 text-[18px] leading-none ml-[0.5px]" 
            style={{ textShadow: '0 0 14px rgba(251, 191, 36, 0.8), 0 0 28px rgba(251, 191, 36, 0.3)' }}
          >
            .
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNewChat}
          className="h-7 w-7 no-drag text-muted-foreground hover:text-foreground shrink-0 rounded-lg"
          aria-label="New Chat (⌘N)"
        >
          <MessageSquare className="size-3.5" />
        </Button>
      </div>

      <div className="px-3 pb-3 pt-2 relative z-10">
        <div className="relative no-drag">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            className="h-9 pl-8 bg-background/80"
            aria-label="Search chats"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3">
        <div className="pb-4">
          {chatGroups.map((group) => (
            <div key={group.label}>
              <div className="px-2.5 pt-4 pb-1.5 first:pt-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {group.label}
                </span>
              </div>
              <div className="space-y-0.5">
                {group.chats.map((chat) => (
                  <div
                    key={chat.id}
                    className={cn(
                      'group flex w-full items-center gap-1 rounded-lg px-1 py-1 text-sm text-left transition-all no-drag overflow-hidden',
                      activeChatId === chat.id && currentView === 'chat'
                        ? 'bg-[#1A1A1A] text-foreground shadow-sm ring-1 ring-white/10'
                        : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center rounded-md px-2 py-1 text-left overflow-hidden"
                      onClick={() => onSelectChat(chat.id)}
                      ref={(element) => {
                        if (element) {
                          chatItemRefs.current.set(chat.id, element)
                        } else {
                          chatItemRefs.current.delete(chat.id)
                        }
                      }}
                    >
                      <span className="flex-1 truncate font-medium">{chat.title || 'New Chat'}</span>
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "transition-opacity text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-destructive/10 shrink-0",
                        activeChatId === chat.id && currentView === 'chat' ? "opacity-70" : "opacity-0 group-hover:opacity-100"
                      )}
                      aria-label={`Delete chat ${chat.title || 'New Chat'}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteChat(chat.id)
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {chats.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="size-10 rounded-full bg-muted flex items-center justify-center mb-3">
                <MessageSquare className="size-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-foreground/70">No chats yet</p>
              <p className="text-xs text-muted-foreground mt-1">Start a new conversation to see it here.</p>
            </div>
          )}

          {chats.length > 0 && filteredChats.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="size-10 rounded-full bg-muted flex items-center justify-center mb-3">
                <Search className="size-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-foreground/70">No matching chats</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different search query.</p>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 mt-auto space-y-0.5 shrink-0 border-t border-sidebar-border/50">
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start gap-2.5 h-9 px-3 transition-all duration-200 rounded-lg no-drag font-medium text-[13px]",
            currentView === 'memory'
              ? "bg-sidebar-accent text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
          )}
          onClick={onOpenMemory}
        >
          <Brain className="size-4" />
          <span className="flex-1 text-left">Memory</span>
          <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Kbd>⌘</Kbd><Kbd>M</Kbd>
          </span>
        </Button>
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start gap-2.5 h-9 px-3 transition-all duration-200 rounded-lg no-drag font-medium text-[13px]",
            currentView === 'agents'
              ? "bg-sidebar-accent text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
          )}
          onClick={onOpenAgents}
        >
          <Bot className="size-4" />
          <span className="flex-1 text-left">Agents</span>
          <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Kbd>⌘</Kbd><Kbd>G</Kbd>
          </span>
        </Button>
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start gap-2.5 h-9 px-3 transition-all duration-200 rounded-lg no-drag font-medium text-[13px]",
            currentView === 'integrations'
              ? "bg-sidebar-accent text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
          )}
          onClick={onOpenIntegrations}
        >
          <Blocks className="size-4" />
          <span className="flex-1 text-left">Integrations</span>
          <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Kbd>⌘</Kbd><Kbd>I</Kbd>
          </span>
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2.5 h-9 px-3 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-all duration-200 rounded-lg no-drag font-medium text-[13px]"
          onClick={onOpenSettings}
        >
          <Settings className="size-4" />
          <span className="flex-1 text-left">Settings</span>
          <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Kbd>⌘</Kbd><Kbd>,</Kbd>
          </span>
        </Button>
      </div>
    </div>
  )
}
