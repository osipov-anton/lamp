import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import {
  AlertCircle,
  Terminal,
  StopCircle,
  ChevronDown,
  Search,
  Check,
  Paperclip,
  X,
  FileText,
  Code2,
  Quote,
  MessageSquareQuote,
  PanelRightClose,
  Plus
} from 'lucide-react'
import { ArrowUp02Icon } from 'hugeicons-react'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { MessageBubble } from './MessageBubble'
import { Kbd } from './CommandPalette'
import lampIcon from '../assets/lamp.png'
import { cn } from '@renderer/lib/utils'
import type {
  AppSettings,
  Chat,
  ChatThread,
  Message,
  MessageAttachment,
  ToolCallState
} from '@renderer/types'

const SUGGESTIONS = [
  { icon: Terminal, label: 'Write code', prompt: 'Help me write ' },
  { icon: Search, label: 'Search the web', prompt: 'Search the web for ' },
  { icon: FileText, label: 'Analyze files', prompt: 'Help me analyze ' },
  { icon: Code2, label: 'Review code', prompt: 'Review this code for ' }
]

interface ChatViewProps {
  chat: Chat | null
  mainThread: ChatThread | null
  sideThread: ChatThread | null
  sideThreads: ChatThread[]
  openThreadId: string | null
  onOpenThread: (threadId: string) => void
  onCloseThread: () => void
  streamingChatId: string | null
  streamingThreadId: string | null
  streamingContent: string
  mainToolCalls: ToolCallState[]
  sideToolCalls: ToolCallState[]
  error: string | null
  onSendMessage: (content: string, attachments?: MessageAttachment[]) => void
  onSendThreadMessage: (content: string, attachments?: MessageAttachment[]) => void
  onStartThread: (messageId: string, sourceThreadId: string, anchorQuote?: string) => Promise<unknown>
  onStopStreaming: () => void
  onDismissError: () => void
  onNewChat: () => void
}

export function ChatView({
  chat,
  mainThread,
  sideThread,
  sideThreads,
  openThreadId,
  onOpenThread,
  onCloseThread,
  streamingChatId,
  streamingThreadId,
  streamingContent,
  mainToolCalls,
  sideToolCalls,
  error,
  onSendMessage,
  onSendThreadMessage,
  onStartThread,
  onStopStreaming,
  onDismissError,
  onNewChat
}: ChatViewProps) {
  const [input, setInput] = useState('')
  const [threadInput, setThreadInput] = useState('')
  const [settings, setSettings] = useState<AppSettings>({
    openRouterApiKey: '',
    model: 'openai/gpt-4o-mini'
  })
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [savingModel, setSavingModel] = useState(false)
  const [selectedAttachments, setSelectedAttachments] = useState<MessageAttachment[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)
  const isMainStreaming =
    chat?.id === streamingChatId && mainThread?.id && mainThread.id === streamingThreadId
  const isThreadStreaming =
    chat?.id === streamingChatId && sideThread?.id && sideThread.id === streamingThreadId
  const isAnyStreaming = Boolean(streamingChatId)

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector('[data-slot="scroll-area-viewport"]')
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [mainThread?.messages, streamingContent])

  useEffect(() => {
    if (chat && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [chat?.id])

  useEffect(() => {
    window.api.settings.get().then(setSettings)
    setModelsLoading(true)
    window.api.settings
      .fetchModels()
      .then(setModels)
      .catch(() => setModels([]))
      .finally(() => setModelsLoading(false))
  }, [])

  useEffect(() => {
    if (!modelOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(target)) {
        setModelOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [modelOpen])

  const filteredModels = !modelSearch.trim()
    ? models
    : models.filter((m) => {
        const q = modelSearch.toLowerCase()
        return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
      })

  const handleSend = () => {
    const trimmed = input.trim()
    if ((!trimmed && selectedAttachments.length === 0) || isMainStreaming) return
    setInput('')
    onSendMessage(trimmed, selectedAttachments)
    setSelectedAttachments([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handlePrimaryAction = () => {
    if (isMainStreaming || isThreadStreaming) {
      onStopStreaming()
      return
    }
    handleSend()
  }

  const handlePickAttachments = async () => {
    if (isMainStreaming) return
    const picked = await window.api.chat.pickAttachments()
    if (!picked || picked.length === 0) return
    setSelectedAttachments((prev) => {
      const map = new Map(prev.map((item) => [item.filePath, item]))
      for (const item of picked) {
        map.set(item.filePath, item)
      }
      return Array.from(map.values())
    })
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  const handleSuggestion = (prompt: string) => {
    setInput(prompt)
    textareaRef.current?.focus()
  }

  if (!chat || !mainThread) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background drag-region relative">
        <div className="max-w-lg w-full px-6 flex flex-col items-center text-center relative z-10">
          <div className="size-[84px] rounded-[24px] flex items-center justify-center shadow-lg shadow-black/20 ring-1 ring-white/10 mb-8 overflow-hidden bg-[#1A1A1A]">
            <img src={lampIcon} alt="Lamp AI" className="size-full object-cover" />
          </div>
          <h2 className="text-[28px] font-semibold tracking-tight text-foreground mb-3">
            Ready when you are
          </h2>
          <p className="text-muted-foreground text-[15px] mb-10 leading-relaxed max-w-sm">
            Start a new conversation to write code, explore ideas, or analyze your files.
          </p>
          <Button
            onClick={onNewChat}
            className="rounded-full px-8 h-[46px] bg-[#1A1A1A] border border-white/5 hover:bg-[#252525] text-white shadow-xl shadow-black/20 no-drag transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] font-medium text-[14.5px] tracking-wide"
          >
            Start a new conversation
          </Button>
          <div className="mt-6 flex items-center gap-3 text-[12px] text-muted-foreground/30">
            <span className="flex items-center gap-1"><Kbd>⌘</Kbd><Kbd>N</Kbd> new chat</span>
            <span className="text-muted-foreground/15">·</span>
            <span className="flex items-center gap-1"><Kbd>⌘</Kbd><Kbd>K</Kbd> commands</span>
          </div>
        </div>
      </div>
    )
  }

  const allMessages: (Message & { _streaming?: boolean })[] = [...mainThread.messages]
  if (isMainStreaming && streamingContent) {
    const lastMsg = allMessages[allMessages.length - 1]
    if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === '') {
      allMessages[allMessages.length - 1] = {
        ...lastMsg,
        content: streamingContent,
        _streaming: true
      }
    }
  }

  return (
    <div className="flex-1 flex min-w-0 bg-background">
      <div className="flex-1 flex flex-col min-w-0 relative">
      {/* Header */}
      <div className="absolute top-0 inset-x-0 h-[52px] z-10 flex items-center justify-between gap-3 px-6 shrink-0 drag-region bg-background/60 backdrop-blur-2xl border-b border-border/30 supports-[backdrop-filter]:bg-background/30">
        <h3 className="text-sm font-semibold tracking-tight truncate no-drag opacity-80">
          {chat.title || 'New Chat'}
        </h3>
        <div className="flex items-center gap-2">
          <div ref={modelDropdownRef} className="relative no-drag shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setModelOpen((prev) => !prev)
                if (modelOpen) setModelSearch('')
              }}
              className="h-7 max-w-[280px] justify-between gap-1.5 px-2.5 text-xs font-normal rounded-lg"
              disabled={savingModel}
            >
              <span className="truncate">
                {models.find((m) => m.id === settings.model)?.name ?? settings.model}
              </span>
              <ChevronDown className="size-3 opacity-50" />
            </Button>
            {modelOpen && (
            <div className="absolute right-0 top-full z-20 mt-1.5 w-[360px] max-w-[70vw] overflow-hidden rounded-xl border bg-popover shadow-xl shadow-black/10">
              <div className="flex items-center border-b px-2.5 py-1.5">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  autoFocus
                  placeholder="Search models..."
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  className="flex h-8 w-full bg-transparent py-1.5 pl-2 pr-2 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <ScrollArea className="max-h-[260px]">
                {modelsLoading ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">Loading models...</div>
                ) : filteredModels.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">No models found</div>
                ) : (
                  <div className="p-1">
                    {filteredModels.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={async () => {
                          if (m.id === settings.model) {
                            setModelOpen(false)
                            return
                          }
                          const next = { ...settings, model: m.id }
                          setSettings(next)
                          setModelOpen(false)
                          setModelSearch('')
                          setSavingModel(true)
                          try {
                            await window.api.settings.save(next)
                          } finally {
                            setSavingModel(false)
                          }
                        }}
                        className={cn(
                          'flex w-full cursor-pointer items-start justify-between gap-2 rounded-lg px-2.5 py-2 text-left outline-none transition-colors duration-150 hover:bg-accent hover:text-accent-foreground',
                          settings.model === m.id && 'bg-accent text-accent-foreground'
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{m.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{m.id}</span>
                        </span>
                        {settings.model === m.id && <Check className="mt-0.5 size-4 shrink-0 text-primary" />}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onNewChat}
          className="h-7 w-7 no-drag text-muted-foreground hover:text-foreground shrink-0 rounded-lg bg-background"
          aria-label="New Chat"
        >
          <Plus className="size-4" />
        </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 min-h-0 pt-[52px]">
        {allMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
            <h3 className="text-2xl font-medium text-foreground mb-2 tracking-tight">What's on your mind?</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-8 leading-relaxed">
              Drop a file, ask a question, or pick a starting point below.
            </p>
            <div className="grid grid-cols-2 gap-2 max-w-[300px] w-full">
              {SUGGESTIONS.map((s) => {
                const SIcon = s.icon
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => handleSuggestion(s.prompt)}
                    className="flex items-center gap-2 rounded-xl border border-border/40 bg-card/50 px-3 py-2.5 text-[13px] text-muted-foreground hover:text-foreground hover:bg-card hover:border-border/60 hover:shadow-sm transition-all duration-200 group text-left no-drag"
                  >
                    <SIcon className="size-3.5 shrink-0 text-primary/40 group-hover:text-primary/70 transition-colors duration-200" />
                    <span>{s.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-6 px-4 sm:px-6">
            <div className="space-y-6">
              {allMessages.map((msg, index) => {
                const msgIsStreaming = Boolean((msg as Message & { _streaming?: boolean })._streaming)
                const isLastAssistant = msg.role === 'assistant' && index === allMessages.length - 1
                const messageToolCalls =
                  msg.toolCalls && msg.toolCalls.length > 0
                    ? msg.toolCalls
                    : isLastAssistant
                      ? mainToolCalls
                      : undefined
                const prevMsg = index > 0 ? allMessages[index - 1] : null
                const showAvatar = !prevMsg || prevMsg.role !== msg.role
                const messageThreads = sideThreads.filter((t) => t.forkFromMessageId === msg.id)
                return (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isStreaming={msgIsStreaming}
                    toolCalls={msgIsStreaming ? mainToolCalls : messageToolCalls}
                    showAvatar={showAvatar}
                    linkedThreads={messageThreads}
                    onOpenThread={onOpenThread}
                    onStartThread={
                      msg.role === 'assistant'
                        ? (messageId, selectedText) =>
                            void onStartThread(messageId, mainThread.id, selectedText)
                        : undefined
                    }
                  />
                )
              })}

              {isMainStreaming && !streamingContent && (
                <div className="flex gap-4 px-2">
                  {allMessages.length === 0 || allMessages[allMessages.length - 1]?.role !== 'assistant' ? (
                    <div className="size-8 shrink-0 rounded-[10px] bg-[#1A1A1A] ring-1 ring-white/10 flex items-center justify-center shadow-sm overflow-hidden">
                      <img src={lampIcon} alt="" className="size-full object-cover" />
                    </div>
                  ) : (
                    <div className="size-8 shrink-0" />
                  )}
                  <div className="min-w-0 max-w-[85%] text-[15px] leading-[1.6] text-foreground pt-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-foreground/30 animate-bounce" />
                      <span className="size-2 rounded-full bg-foreground/30 animate-bounce [animation-delay:0.15s]" />
                      <span className="size-2 rounded-full bg-foreground/30 animate-bounce [animation-delay:0.3s]" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="shrink-0 relative z-10">
        <div className="absolute -top-12 inset-x-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        <div className="bg-background px-4 pb-4 pt-2">
          <div className="max-w-3xl mx-auto relative">
            {error && (
              <div className="absolute bottom-full mb-3 inset-x-0 flex items-center gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive shadow-sm backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
                <AlertCircle className="size-4 shrink-0" />
                <span className="flex-1 font-medium">{error}</span>
                <button
                  onClick={onDismissError}
                  className="text-xs font-semibold opacity-70 hover:opacity-100 transition-opacity"
                >
                  Dismiss
                </button>
              </div>
            )}

            {selectedAttachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {selectedAttachments.map((attachment) =>
                  isImageAttachment(attachment) && resolveAttachmentImageSrc(attachment) ? (
                    <div
                      key={attachment.id}
                      className="group relative size-20 overflow-hidden rounded-xl border bg-muted/30"
                      title={attachment.name}
                    >
                      <img
                        src={resolveAttachmentImageSrc(attachment) ?? ''}
                        alt=""
                        className="size-full object-cover"
                        loading="lazy"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedAttachments((prev) => prev.filter((item) => item.id !== attachment.id))
                        }
                        className="absolute right-1 top-1 rounded-md bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label={`Remove ${attachment.name}`}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div
                      key={attachment.id}
                      className="inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground"
                    >
                      <FileText className="size-3.5 shrink-0" />
                      <span className="max-w-[220px] truncate text-foreground">{attachment.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedAttachments((prev) => prev.filter((item) => item.id !== attachment.id))
                        }
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  )
                )}
              </div>
            )}

            <div className="relative flex items-end bg-[#0A0A0A] rounded-[28px] border border-white/[0.08] shadow-lg shadow-black/20 focus-within:border-white/[0.15] focus-within:shadow-[0_0_20px_rgba(255,255,255,0.03)] focus-within:bg-[#0E0E0E] transition-all duration-500 group no-drag">
              <div className="pl-3 pb-2.5 pt-2.5 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-[36px] rounded-full text-white/30 hover:text-white/80 hover:bg-white/5 transition-all duration-300"
                  onClick={handlePickAttachments}
                  disabled={isAnyStreaming}
                >
                  <Paperclip className="size-[18px]" />
                </Button>
              </div>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder={isAnyStreaming ? "Wait for response..." : "Ask anything..."}
                rows={1}
                className="flex-1 max-h-[200px] min-h-[56px] resize-none bg-transparent px-3 py-[18px] text-[15px] leading-[20px] text-white/90 placeholder:text-white/30 focus:outline-none scrollbar-thin disabled:opacity-50 transition-colors duration-300"
                disabled={isAnyStreaming}
              />
              <div className="pr-3 pb-2.5 pt-2.5 shrink-0">
                <Button
                  onClick={handlePrimaryAction}
                  size="icon"
                  disabled={(!input.trim() && selectedAttachments.length === 0 && !isMainStreaming) || (isAnyStreaming && !isMainStreaming)}
                  className={cn(
                    'size-[36px] rounded-full transition-all duration-500',
                    (input.trim() || selectedAttachments.length > 0 || isMainStreaming) && !(isAnyStreaming && !isMainStreaming)
                      ? 'bg-white text-black hover:bg-white/90 hover:scale-105 hover:shadow-[0_0_15px_rgba(255,255,255,0.2)] active:scale-95'
                      : 'bg-transparent text-white/20 hover:text-white/40 hover:bg-white/5'
                  )}
                >
                  {isMainStreaming || isThreadStreaming ? (
                    <StopCircle className="size-[18px]" />
                  ) : (
                    <ArrowUp02Icon className="size-[18px] stroke-[2.5]" />
                  )}
                </Button>
              </div>
            </div>
            <div className="text-center mt-2.5">
              <span className="text-[10px] text-muted-foreground/35 font-medium tracking-widest uppercase">
                Lamp can make mistakes
              </span>
            </div>
          </div>
        </div>
      </div>
      </div>

      {sideThread && (
        <div className="w-[380px] max-w-[45%] border-l border-border/50 bg-card/30 flex flex-col min-w-0">
          <div className="h-[52px] px-4 border-b border-border/50 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{sideThread.title}</p>
              <p className="text-[11px] text-muted-foreground truncate">Isolated thread</p>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => onCloseThread()}>
              <X className="size-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-4 space-y-4">
              {sideThread.messages.length === 0 && !isThreadStreaming && (
                <div className="flex flex-col items-center justify-center py-12 text-center opacity-70">
                  <MessageSquareQuote className="size-8 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">Thread started</p>
                  <p className="text-xs text-muted-foreground">Send a message to discuss</p>
                </div>
              )}
              {sideThread.messages.map((msg, index) => {
                const prevMsg = index > 0 ? sideThread.messages[index - 1] : null
                const showAvatar = !prevMsg || prevMsg.role !== msg.role
                const msgIsStreaming =
                  isThreadStreaming &&
                  index === sideThread.messages.length - 1 &&
                  msg.role === 'assistant' &&
                  msg.content === ''
                const content =
                  msgIsStreaming && streamingContent ? { ...msg, content: streamingContent } : msg
                return (
                  <MessageBubble
                    key={msg.id}
                    message={content}
                    isStreaming={msgIsStreaming}
                    toolCalls={msgIsStreaming ? sideToolCalls : msg.toolCalls}
                    showAvatar={showAvatar}
                  />
                )
              })}
            </div>
          </ScrollArea>
          <div className="p-3 border-t border-border/50 bg-background/50 flex flex-col gap-2">
            {sideThread.anchorQuote && (
              <div className="px-3 py-2 rounded-lg bg-muted/40 border border-border/40 text-xs text-muted-foreground flex gap-2 mx-1">
                <Quote className="size-3 shrink-0 mt-0.5 opacity-60" />
                <p className="line-clamp-3 leading-relaxed whitespace-pre-wrap">{sideThread.anchorQuote}</p>
              </div>
            )}
            <div className="flex items-end bg-[#0A0A0A] rounded-2xl border border-white/[0.08] shadow-sm focus-within:border-white/[0.15] focus-within:shadow-[0_0_15px_rgba(255,255,255,0.03)] focus-within:bg-[#0E0E0E] transition-all duration-500">
              <textarea
                value={threadInput}
                onChange={(e) => setThreadInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    const value = threadInput.trim()
                    if (!value || isAnyStreaming) return
                    setThreadInput('')
                    void onSendThreadMessage(value)
                  }
                }}
                rows={1}
                placeholder={isAnyStreaming ? "Wait for response..." : "Reply in thread..."}
                className="flex-1 resize-none bg-transparent px-3 py-3 text-[13px] leading-[20px] text-white/90 placeholder:text-white/30 outline-none max-h-36 min-h-[44px] scrollbar-thin disabled:opacity-50 transition-colors duration-300"
                disabled={isAnyStreaming}
              />
              <div className="pr-2 pb-2 pt-2 shrink-0">
                <Button
                  type="button"
                  size="icon"
                  className={cn(
                    "size-[28px] rounded-lg transition-all duration-500",
                    (threadInput.trim() || isThreadStreaming) && !(isAnyStreaming && !isThreadStreaming)
                      ? "bg-white text-black hover:bg-white/90 hover:scale-105 active:scale-95 shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                      : "bg-transparent text-white/20 hover:text-white/40 hover:bg-white/5"
                  )}
                  onClick={() => {
                    if (isThreadStreaming) {
                      onStopStreaming()
                      return
                    }
                    const value = threadInput.trim()
                    if (!value || isAnyStreaming) return
                    setThreadInput('')
                    void onSendThreadMessage(value)
                  }}
                  disabled={(!threadInput.trim() && !isThreadStreaming) || (isAnyStreaming && !isThreadStreaming)}
                >
                  {isThreadStreaming ? <StopCircle className="size-[14px]" /> : <ArrowUp02Icon className="size-[16px] stroke-[2.5]" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function resolveAttachmentImageSrc(attachment: MessageAttachment): string | null {
  return attachment.previewDataUrl?.startsWith('data:image/') ? attachment.previewDataUrl : null
}

function isImageAttachment(attachment: MessageAttachment): boolean {
  if (attachment.previewDataUrl?.startsWith('data:image/')) return true
  if (attachment.isImage) return true
  const lowerName = attachment.name.toLowerCase()
  const lowerPath = attachment.filePath.toLowerCase()
  return (
    /\.(png|jpe?g|jfif|gif|webp|bmp|heic|heif)$/.test(lowerName) ||
    /\.(png|jpe?g|jfif|gif|webp|bmp|heic|heif)$/.test(lowerPath)
  )
}
