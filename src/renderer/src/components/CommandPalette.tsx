import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MessageSquare,
  Plus,
  Settings,
  Blocks,
  Trash2,
  Search,
  ArrowRight
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { ScrollArea } from './ui/scroll-area'
import type { Chat } from '@renderer/types'

interface CommandItem {
  id: string
  label: string
  hint?: string
  icon: React.ComponentType<{ className?: string }>
  shortcut?: string[]
  section: string
  onSelect: () => void
  destructive?: boolean
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chats: Chat[]
  activeChatId: string | null
  onSelectChat: (id: string) => void
  onNewChat: () => void
  onDeleteChat: (id: string) => void
  onOpenSettings: () => void
  onOpenIntegrations: () => void
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-white/10 bg-white/[0.06] px-1.5 font-sans text-[11px] font-medium text-white/40',
        className
      )}
    >
      {children}
    </kbd>
  )
}

export function CommandPalette({
  open,
  onOpenChange,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onOpenSettings,
  onOpenIntegrations
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    onOpenChange(false)
    setQuery('')
    setSelectedIndex(0)
  }, [onOpenChange])

  const actions = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      {
        id: 'new-chat',
        label: 'New Chat',
        icon: Plus,
        shortcut: ['N'],
        section: 'Actions',
        onSelect: () => {
          close()
          onNewChat()
        }
      },
      {
        id: 'settings',
        label: 'Settings',
        hint: 'API keys, model config',
        icon: Settings,
        shortcut: [','],
        section: 'Actions',
        onSelect: () => {
          close()
          onOpenSettings()
        }
      },
      {
        id: 'integrations',
        label: 'Integrations',
        hint: 'Telegram, Gmail, Calendar',
        icon: Blocks,
        shortcut: ['I'],
        section: 'Actions',
        onSelect: () => {
          close()
          onOpenIntegrations()
        }
      }
    ]

    if (activeChatId) {
      items.push({
        id: 'delete-chat',
        label: 'Delete Current Chat',
        icon: Trash2,
        shortcut: ['Backspace'],
        section: 'Actions',
        destructive: true,
        onSelect: () => {
          close()
          onDeleteChat(activeChatId)
        }
      })
    }

    return items
  }, [activeChatId, close, onNewChat, onOpenSettings, onOpenIntegrations, onDeleteChat])

  const chatItems = useMemo<CommandItem[]>(
    () =>
      chats.map((chat) => ({
        id: `chat-${chat.id}`,
        label: chat.title || 'New Chat',
        icon: MessageSquare,
        section: 'Chats',
        onSelect: () => {
          close()
          onSelectChat(chat.id)
        }
      })),
    [chats, close, onSelectChat]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [...actions, ...chatItems]
    return [...actions, ...chatItems].filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.hint?.toLowerCase().includes(q) ||
        item.section.toLowerCase().includes(q)
    )
  }, [query, actions, chatItems])

  const sections = useMemo(() => {
    const map = new Map<string, CommandItem[]>()
    for (const item of filtered) {
      const list = map.get(item.section) || []
      list.push(item)
      map.set(item.section, list)
    }
    return Array.from(map.entries())
  }, [filtered])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        filtered[selectedIndex]?.onSelect()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    },
    [filtered, selectedIndex, close]
  )

  if (!open) return null

  let flatIndex = -1

  return (
    <div className="fixed inset-0 z-[100]" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={close}
      />

      {/* Panel */}
      <div className="absolute left-1/2 top-[min(20%,160px)] w-full max-w-[540px] -translate-x-1/2 animate-in fade-in slide-in-from-top-3 duration-200">
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141414] shadow-2xl shadow-black/50 ring-1 ring-white/[0.04]">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-4">
            <Search className="size-[18px] shrink-0 text-white/30" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command or search..."
              className="h-[52px] flex-1 bg-transparent text-[15px] text-white/90 placeholder:text-white/25 focus:outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            <Kbd className="opacity-60">Esc</Kbd>
          </div>

          {/* Results */}
          <ScrollArea className="max-h-[min(50vh,360px)]">
            <div ref={listRef} className="p-1.5">
              {filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Search className="size-8 text-white/10 mb-3" />
                  <p className="text-sm text-white/30">No results found</p>
                  <p className="text-xs text-white/15 mt-1">Try a different search term</p>
                </div>
              )}

              {sections.map(([section, items]) => (
                <div key={section} className="mb-1 last:mb-0">
                  <div className="px-2.5 pt-2 pb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/20">
                      {section}
                    </span>
                  </div>
                  {items.map((item) => {
                    flatIndex++
                    const isSelected = flatIndex === selectedIndex
                    const Icon = item.icon
                    const idx = flatIndex
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-selected={isSelected}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-100 outline-none group',
                          isSelected
                            ? 'bg-white/[0.08] text-white'
                            : 'text-white/60 hover:bg-white/[0.04] hover:text-white/80'
                        )}
                        onClick={item.onSelect}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <div
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                            isSelected ? 'bg-white/10' : 'bg-white/[0.04]',
                            item.destructive && isSelected && 'bg-red-500/20'
                          )}
                        >
                          <Icon
                            className={cn(
                              'size-4',
                              item.destructive
                                ? 'text-red-400'
                                : isSelected
                                  ? 'text-white/80'
                                  : 'text-white/30'
                            )}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span
                            className={cn(
                              'text-[13.5px] font-medium truncate block',
                              item.destructive && 'text-red-400'
                            )}
                          >
                            {item.label}
                          </span>
                          {item.hint && (
                            <span className="text-[11.5px] text-white/25 truncate block">
                              {item.hint}
                            </span>
                          )}
                        </div>
                        {item.shortcut && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Kbd>⌘</Kbd>
                            {item.shortcut.map((k) => (
                              <Kbd key={k}>{k}</Kbd>
                            ))}
                          </div>
                        )}
                        {!item.shortcut && isSelected && (
                          <ArrowRight className="size-3.5 text-white/20 shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="flex items-center gap-4 border-t border-white/[0.06] px-4 py-2.5">
            <div className="flex items-center gap-1.5 text-[11px] text-white/20">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <span>navigate</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-white/20">
              <Kbd>↵</Kbd>
              <span>select</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-white/20">
              <Kbd>Esc</Kbd>
              <span>close</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
