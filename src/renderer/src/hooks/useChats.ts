import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { Chat, ChatThread, MessageAttachment } from '@renderer/types'

export function useChats() {
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [streamingChatId, setStreamingChatId] = useState<string | null>(null)
  const [streamingThreadId, setStreamingThreadId] = useState<string | null>(null)
  const [openThreadId, setOpenThreadId] = useState<string | null>(null)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const streamingContentRef = useRef('')

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null
  const activeMainThread = useMemo(
    () => (activeChat ? activeChat.threads.find((thread) => thread.id === activeChat.mainThreadId) ?? null : null),
    [activeChat]
  )
  const activeSideThread = useMemo(
    () => (activeChat && openThreadId ? activeChat.threads.find((thread) => thread.id === openThreadId) ?? null : null),
    [activeChat, openThreadId]
  )

  const loadChats = useCallback(async (): Promise<Chat[]> => {
    const list = await window.api.chat.listChats()
    setChats(list)
    return list
  }, [])

  useEffect(() => {
    loadChats()
  }, [loadChats])

  useEffect(() => {
    setOpenThreadId(null)
  }, [activeChatId])

  useEffect(() => {
    const unsubChunk = window.api.chat.onStreamChunk(({ chatId, threadId, chunk }) => {
      if (chatId && threadId && chatId === streamingChatId && threadId === streamingThreadId) {
        streamingContentRef.current += chunk
        setStreamingContent(streamingContentRef.current)
      }
    })

    const unsubEnd = window.api.chat.onStreamEnd(({ chatId, threadId }) => {
      if (chatId && threadId && chatId === streamingChatId && threadId === streamingThreadId) {
        setStreamingChatId(null)
        setStreamingThreadId(null)
        setStreamingContent('')
        streamingContentRef.current = ''
        loadChats().then((list) => {
          if (list.some((chat) => chat.id === chatId)) {
            setActiveChatId(chatId)
          }
        })
      }
    })

    const unsubError = window.api.chat.onStreamError(({ chatId, threadId, error: err }) => {
      if (
        streamingChatId &&
        streamingThreadId &&
        (chatId !== streamingChatId || threadId !== streamingThreadId)
      ) {
        return
      }
      setStreamingChatId(null)
      setStreamingThreadId(null)
      setStreamingContent('')
      streamingContentRef.current = ''
      setError(err)
      loadChats()
    })

    return () => {
      unsubChunk()
      unsubEnd()
      unsubError()
    }
  }, [loadChats, streamingChatId, streamingThreadId])

  const createChat = useCallback(async () => {
    const chat = await window.api.chat.createChat()
    await loadChats()
    setActiveChatId(chat.id)
    setOpenThreadId(null)
    return chat
  }, [loadChats])

  const deleteChat = useCallback(
    async (id: string) => {
      if (streamingChatId === id) {
        setError('Cannot delete a chat while it is streaming a response.')
        return
      }

      const shouldDelete = window.confirm('Delete this chat permanently?')
      if (!shouldDelete) return

      await window.api.chat.deleteChat(id)
      const list = await loadChats()
      if (activeChatId === id) setActiveChatId(list[0]?.id ?? null)
    },
    [activeChatId, loadChats, streamingChatId]
  )

  const sendMessageToThread = useCallback(
    async (threadId: string, content: string, attachments: MessageAttachment[] = []) => {
      if (!activeChatId || !threadId || streamingChatId) return

      setError(null)
      setStreamingChatId(activeChatId)
      setStreamingThreadId(threadId)
      setStreamingContent('')
      streamingContentRef.current = ''

      const updatedChat = await window.api.chat.getChat(activeChatId)
      if (updatedChat) {
        const userMsg = {
          id: crypto.randomUUID(),
          role: 'user' as const,
          content,
          timestamp: Date.now(),
          attachments: attachments.length > 0 ? attachments : undefined
        }
        const assistantPlaceholder = {
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: '',
          timestamp: Date.now() + 1
        }
        setChats((prev) =>
          prev.map((c) =>
            c.id === activeChatId
              ? {
                  ...c,
                  threads: c.threads.map((thread) =>
                    thread.id === threadId
                      ? {
                          ...thread,
                          messages: [...thread.messages, userMsg, assistantPlaceholder],
                          updatedAt: Date.now()
                        }
                      : thread
                  ),
                  updatedAt: Date.now()
                }
              : c
          )
        )
      }

      await window.api.chat.sendMessage(activeChatId, threadId, content, attachments)
    },
    [activeChatId, streamingChatId]
  )

  const sendMessage = useCallback(
    async (content: string, attachments: MessageAttachment[] = []) => {
      if (!activeMainThread) return
      await sendMessageToThread(activeMainThread.id, content, attachments)
    },
    [activeMainThread, sendMessageToThread]
  )

  const sendThreadMessage = useCallback(
    async (content: string, attachments: MessageAttachment[] = []) => {
      if (!activeSideThread) return
      await sendMessageToThread(activeSideThread.id, content, attachments)
    },
    [activeSideThread, sendMessageToThread]
  )

  const createThreadFromMessage = useCallback(
    async (messageId: string, sourceThreadId: string, anchorQuote?: string) => {
      if (!activeChatId) return null
      const chat = chats.find((c) => c.id === activeChatId)
      const sourceThread = chat?.threads.find((thread) => thread.id === sourceThreadId)
      const sourceMessage = sourceThread?.messages.find((message) => message.id === messageId)
      const hasAssistantResponse =
        sourceMessage?.role === 'assistant' && sourceMessage.content.trim().length > 0
      if (!hasAssistantResponse) return null

      const created = await window.api.chat.createThread({
        chatId: activeChatId,
        sourceThreadId,
        messageId,
        anchorQuote
      })
      if (!created) return null
      await loadChats()
      setOpenThreadId(created.id)
      return created
    },
    [activeChatId, chats, loadChats]
  )

  const closeThread = useCallback(async () => {
    if (!activeChatId || !openThreadId) return
    const chat = chats.find(c => c.id === activeChatId)
    const thread = chat?.threads.find(t => t.id === openThreadId)
    if (thread && thread.messages.length === 0) {
      await window.api.chat.deleteThread(activeChatId, openThreadId)
      await loadChats()
    }
    setOpenThreadId(null)
  }, [activeChatId, openThreadId, chats, loadChats])

  const stopStreaming = useCallback(async () => {
    if (!streamingChatId) return
    await window.api.chat.stopStream(streamingChatId, streamingThreadId ?? undefined)
  }, [streamingChatId, streamingThreadId])

  const dismissError = useCallback(() => setError(null), [])

  const sideThreads = useMemo(
    () =>
      activeChat
        ? activeChat.threads.filter((thread) => thread.id !== activeChat.mainThreadId)
        : ([] as ChatThread[]),
    [activeChat]
  )

  const setActiveChatIdSafe = useCallback(async (id: string | null) => {
    if (activeChatId === id) return
    if (activeChatId && openThreadId) {
      const chat = chats.find(c => c.id === activeChatId)
      const thread = chat?.threads.find(t => t.id === openThreadId)
      if (thread && thread.messages.length === 0) {
        await window.api.chat.deleteThread(activeChatId, openThreadId)
        await loadChats()
      }
    }
    setActiveChatId(id)
  }, [activeChatId, openThreadId, chats, loadChats])

  return {
    chats,
    activeChat,
    activeMainThread,
    activeSideThread,
    sideThreads,
    openThreadId,
    setOpenThreadId,
    closeThread,
    activeChatId,
    setActiveChatId: setActiveChatIdSafe,
    streamingChatId,
    streamingThreadId,
    streamingContent,
    error,
    dismissError,
    createChat,
    createThreadFromMessage,
    deleteChat,
    sendMessage,
    sendThreadMessage,
    stopStreaming
  }
}
