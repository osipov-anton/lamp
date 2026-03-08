import { Streamdown } from 'streamdown'
import { code } from '@streamdown/code'
import lampIcon from '../assets/lamp.png'
import { cn } from '@renderer/lib/utils'
import { useRef, useState, useEffect } from 'react'
import { User, FileText, MessageSquarePlus, Quote, MessagesSquare } from 'lucide-react'
import type { Message, ToolCallState, ChatThread } from '@renderer/types'
import { ToolCallCard } from './ToolCallCard'

const streamdownPlugins = { code }

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
  toolCalls?: ToolCallState[]
  showAvatar?: boolean
  linkedThreads?: ChatThread[]
  onStartThread?: (messageId: string, selectedText?: string) => void
  onOpenThread?: (threadId: string) => void
  onMentionClick?: (handle: string) => void
}

export function MessageBubble({
  message,
  isStreaming,
  toolCalls,
  showAvatar = true,
  linkedThreads,
  onStartThread,
  onOpenThread,
  onMentionClick
}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const hasToolCalls = toolCalls && toolCalls.length > 0
  const hasAttachments = Boolean(message.attachments && message.attachments.length > 0)
  const hasAssistantResponse = isAssistant && message.content.trim().length > 0
  const textContainerRef = useRef<HTMLDivElement | null>(null)
  const [selectedSnippet, setSelectedSnippet] = useState<{ text: string; top: number; left: number } | null>(null)
  
  // Only allow thread creation from actual assistant responses, not placeholders.
  const canThread = Boolean(onStartThread && hasAssistantResponse)

  const captureSelection = () => {
    if (!canThread) return
    setTimeout(() => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelectedSnippet(null)
        return
      }
      const text = sel.toString().trim()
      if (!text) {
        setSelectedSnippet(null)
        return
      }
      const range = sel.getRangeAt(0)
      const container = textContainerRef.current
      if (!container) return
      if (!container.contains(range.commonAncestorContainer)) {
        setSelectedSnippet(null)
        return
      }
      
      const rect = range.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      
      setSelectedSnippet({
        text: text.slice(0, 600),
        top: rect.top - containerRect.top,
        left: rect.left - containerRect.left + (rect.width / 2)
      })
    }, 10)
  }

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (selectedSnippet && textContainerRef.current && !textContainerRef.current.contains(e.target as Node)) {
        setSelectedSnippet(null)
      }
    }
    document.addEventListener('mousedown', handleGlobalClick)
    return () => document.removeEventListener('mousedown', handleGlobalClick)
  }, [selectedSnippet])

  return (
    <div className={cn('relative group flex gap-4 px-2', isUser ? 'flex-row-reverse' : '')}>
      {showAvatar ? (
        <div className={cn(
          "size-8 shrink-0 flex items-center justify-center mt-0.5 shadow-sm overflow-hidden",
          isUser 
            ? "bg-secondary text-secondary-foreground rounded-full" 
            : "bg-[#1A1A1A] ring-1 ring-white/10 rounded-[10px]"
        )}>
          {isUser ? <User className="size-4" /> : <img src={lampIcon} alt="" className="size-full object-cover" />}
        </div>
      ) : (
        <div className="size-8 shrink-0" />
      )}

      <div
        ref={textContainerRef}
        onMouseUp={captureSelection}
        className={cn(
          'relative min-w-0 max-w-[85%] text-[15px] leading-[1.6]',
          isUser
            ? 'rounded-2xl rounded-tr-sm bg-secondary/60 text-secondary-foreground px-5 py-3 shadow-sm'
            : 'text-foreground pt-1.5'
        )}
      >
        {/* Hover Action Bar */}
        {canThread && !isStreaming && (
          <div className="absolute -top-3 -right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-all duration-200 bg-background border border-border shadow-sm rounded-lg flex items-center p-0.5 z-10">
            <button
              onClick={() => onStartThread?.(message.id)}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md flex items-center gap-1.5 text-xs font-medium"
              title="Reply in thread"
            >
              <MessageSquarePlus className="size-3.5" />
            </button>
          </div>
        )}

        <div>
          {isUser ? (
            <>
              {message.content ? <UserMessageContent content={message.content} onMentionClick={onMentionClick} /> : null}
              {hasAttachments && (
                <div className="mt-2 space-y-1.5">
                  {message.attachments?.map((attachment) => (
                    isImageAttachment(attachment) && resolveAttachmentImageSrc(attachment) ? (
                      <a
                        key={attachment.id}
                        href={resolveAttachmentImageSrc(attachment) ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        title={attachment.name}
                        className="block overflow-hidden rounded-lg border border-border/60 bg-background/80"
                      >
                        <img
                          src={resolveAttachmentImageSrc(attachment) ?? undefined}
                          alt=""
                          className="max-h-[260px] w-full object-cover"
                          loading="lazy"
                        />
                      </a>
                    ) : (
                      <div
                        key={attachment.id}
                        className="inline-flex items-center gap-2 rounded-md bg-background/70 px-2 py-1 text-xs"
                      >
                        <FileText className="size-3.5 shrink-0" />
                        <span className="max-w-[280px] truncate">{attachment.name}</span>
                      </div>
                    )
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {hasToolCalls && (
                <div className="space-y-2 mb-3">
                  {toolCalls.map((tc) => (
                    <ToolCallCard key={tc.key} toolCall={tc} />
                  ))}
                </div>
              )}
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <Streamdown
                  animated
                  plugins={streamdownPlugins}
                  isAnimating={isStreaming}
                >
                  {message.content}
                </Streamdown>
              </div>
            </>
          )}
        </div>

        {/* Selected Quote Action */}
        {selectedSnippet && canThread && (
          <div 
            className="absolute z-50 animate-in fade-in zoom-in-95 duration-200 pointer-events-auto"
            style={{ 
              top: Math.max(selectedSnippet.top - 44, -16), 
              left: selectedSnippet.left,
              transform: 'translateX(-50%)'
            }}
          >
            <button
              type="button"
              onMouseDown={(e) => {
                // Prevent selection clearing on mousedown
                e.preventDefault()
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onStartThread?.(message.id, selectedSnippet.text)
                setSelectedSnippet(null)
                window.getSelection()?.removeAllRanges()
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-lg transition-all hover:scale-105 active:scale-95 border border-border/10 whitespace-nowrap"
            >
              <Quote className="size-3.5 opacity-80" />
              Discuss quote
            </button>
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
          </div>
        )}

        {/* Thread Previews */}
        {linkedThreads && linkedThreads.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {linkedThreads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => onOpenThread?.(thread.id)}
                className="group/thread inline-flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground hover:border-border/80"
              >
                <MessagesSquare className="size-3.5 text-primary/70 group-hover/thread:text-primary transition-colors" />
                <span className="text-foreground/80 group-hover/thread:text-foreground transition-colors">{thread.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function UserMessageContent({
  content,
  onMentionClick
}: {
  content: string
  onMentionClick?: (handle: string) => void
}) {
  const match = content.match(/^@(\w+)\s/)
  if (!match) {
    return <p className="whitespace-pre-wrap break-words">{content}</p>
  }

  const handle = match[1]
  const rest = content.slice(match[0].length)

  return (
    <p className="whitespace-pre-wrap break-words">
      <button
        type="button"
        onClick={() => onMentionClick?.(handle)}
        className="inline-flex items-center gap-1 rounded-md bg-violet-500/20 text-violet-300 px-1.5 py-0.5 text-[13px] font-medium ring-1 ring-violet-500/30 hover:bg-violet-500/30 hover:ring-violet-500/50 transition-all cursor-pointer align-baseline mr-1"
      >
        @{handle}
      </button>
      {rest}
    </p>
  )
}

function resolveAttachmentImageSrc(
  attachment: NonNullable<Message['attachments']>[number]
): string | null {
  return attachment.previewDataUrl?.startsWith('data:image/') ? attachment.previewDataUrl : null
}

function isImageAttachment(attachment: NonNullable<Message['attachments']>[number]): boolean {
  if (attachment.previewDataUrl?.startsWith('data:image/')) return true
  if (attachment.isImage) return true
  const lowerName = attachment.name.toLowerCase()
  const lowerPath = attachment.filePath.toLowerCase()
  return /\.(png|jpe?g|jfif|gif|webp|bmp|heic|heif)$/.test(lowerName) ||
    /\.(png|jpe?g|jfif|gif|webp|bmp|heic|heif)$/.test(lowerPath)
}
