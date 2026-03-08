import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  AgentToolResultPayload,
  MemoryQueryHit,
  RunState,
  ToolCallState,
  AgentRuntimePhase,
  ToolLifecycleStatus
} from '@renderer/types'

const EMPTY_RUN: RunState = {
  runId: '',
  chatId: '',
  phase: 'init',
  iteration: 0,
  toolCalls: [],
  thinkingContent: '',
  streamingContent: ''
}

export function useAgentRun(activeChatId: string | null, activeThreadId: string | null) {
  const [run, setRun] = useState<RunState>(EMPTY_RUN)
  const [isActive, setIsActive] = useState(false)
  const thinkingRef = useRef('')
  const streamRef = useRef('')
  const rootRunIdRef = useRef<string | null>(null)

  const reset = useCallback(() => {
    setRun(EMPTY_RUN)
    setIsActive(false)
    thinkingRef.current = ''
    streamRef.current = ''
    rootRunIdRef.current = null
  }, [])

  useEffect(() => {
    if (!activeChatId || !activeThreadId) {
      reset()
      return
    }

    // Important: each chat must have an isolated run timeline.
    // Without this reset, tool calls from a previous chat can leak into a new one.
    setRun(EMPTY_RUN)
    setIsActive(false)
    thinkingRef.current = ''
    streamRef.current = ''
    rootRunIdRef.current = null

    const unsubStreamChunk = window.api.agent.onStreamChunk((data) => {
      if (data.chatId !== activeChatId) return
      if (data.threadId !== activeThreadId) return
      streamRef.current += data.chunk
      setRun((prev) => ({ ...prev, streamingContent: streamRef.current }))
    })

    console.log('[useAgentRun] subscribed to agent events for chat:', activeChatId)

    const unsubThinking = window.api.agent.onThinkingChunk((data) => {
      if (data.chatId !== activeChatId) return
      if (data.threadId !== activeThreadId) return
      thinkingRef.current += data.chunk
      setRun((prev) => ({ ...prev, thinkingContent: thinkingRef.current }))
    })

    const unsubToolLifecycle = window.api.agent.onToolLifecycle((data) => {
      console.log('[useAgentRun] tool-lifecycle event:', data)
      const payload = data as {
        chatId: string
        threadId: string
        runId: string
        agentId?: string
        callId: string
        toolId: string
        toolName: string
        status: ToolLifecycleStatus
        statusText?: string
        phase?: string
        percent?: number
        elapsedMs: number
        preview?: string
      }
      if (payload.chatId !== activeChatId) return
      if (payload.threadId !== activeThreadId) return
      const key = `${payload.runId}:${payload.callId}`

      setRun((prev) => {
        const existing = prev.toolCalls.find((tc) => tc.key === key)
        if (existing) {
          return {
            ...prev,
            toolCalls: prev.toolCalls.map((tc) =>
              tc.key === key
                ? {
                    ...tc,
                    status: payload.status,
                    statusText: payload.statusText ?? tc.statusText,
                    phase: payload.phase ?? tc.phase,
                    percent: payload.percent ?? tc.percent,
                    elapsedMs: payload.elapsedMs,
                    preview: payload.preview ?? tc.preview
                  }
                : tc
            )
          }
        }

        const newTc: ToolCallState = {
          key,
          runId: payload.runId,
          agentId: payload.agentId,
          callId: payload.callId,
          toolId: payload.toolId,
          toolName: payload.toolName || payload.toolId,
          status: payload.status,
          statusText: payload.statusText,
          phase: payload.phase,
          percent: payload.percent,
          elapsedMs: payload.elapsedMs,
          preview: payload.preview
        }
        return { ...prev, toolCalls: [...prev.toolCalls, newTc] }
      })
    })

    const unsubToolResult = window.api.agent.onToolResult((data) => {
      const payload = data as AgentToolResultPayload
      if (payload.chatId !== activeChatId) return
      if (payload.threadId !== activeThreadId) return
      const key = `${payload.runId}:${payload.callId}`

      setRun((prev) => ({
        ...prev,
        toolCalls: prev.toolCalls.map((tc) =>
          tc.key === key
            ? {
                ...tc,
                result: {
                  success: true,
                  content: payload.text,
                  memoryQueryHits:
                    payload.toolId === 'memory_query'
                      ? parseMemoryQueryHits(payload.text)
                      : tc.result?.memoryQueryHits,
                  imagePath: tc.result?.imagePath,
                  error: tc.result?.error
                }
              }
            : tc
        )
      }))
    })

    const unsubRunState = window.api.agent.onRunState((data) => {
      console.log('[useAgentRun] run-state event:', data)
      if (data.chatId !== activeChatId) return
      if (data.threadId !== activeThreadId) return
      const isNewRoot = !rootRunIdRef.current
      if (isNewRoot) {
        rootRunIdRef.current = data.runId
        setIsActive(true)
      }
      setRun((prev) => {
        if (isNewRoot) {
          return {
            ...EMPTY_RUN,
            runId: data.runId,
            chatId: data.chatId,
            phase: data.phase as AgentRuntimePhase,
            iteration: data.iteration
          }
        }

        // Keep child-agent runs in the same timeline without resetting root state.
        if (data.runId !== rootRunIdRef.current) {
          return prev
        }

        return {
          ...prev,
          runId: data.runId,
          chatId: data.chatId,
          phase: data.phase as AgentRuntimePhase,
          iteration: data.iteration
        }
      })
    })

    const unsubRunComplete = window.api.agent.onRunComplete((data) => {
      console.log('[useAgentRun] run-complete event:', data)
      if (data.chatId !== activeChatId) return
      if (data.threadId !== activeThreadId) return
      if (data.runId !== rootRunIdRef.current) return
      setIsActive(false)
      streamRef.current = ''
      thinkingRef.current = ''
      rootRunIdRef.current = null
    })

    const unsubRunError = window.api.agent.onRunError((data) => {
      console.log('[useAgentRun] run-error event:', data)
      if (data.chatId !== activeChatId) return
      if (data.threadId !== activeThreadId) return
      if (data.runId !== rootRunIdRef.current) return
      setIsActive(false)
      streamRef.current = ''
      thinkingRef.current = ''
      rootRunIdRef.current = null
    })

    return () => {
      unsubStreamChunk()
      unsubThinking()
      unsubToolLifecycle()
      unsubToolResult()
      unsubRunState()
      unsubRunComplete()
      unsubRunError()
    }
  }, [activeChatId, activeThreadId, reset])

  return { run, isActive, reset }
}

function parseMemoryQueryHits(text: string): MemoryQueryHit[] | undefined {
  try {
    const parsed = JSON.parse(text) as unknown
    if (!Array.isArray(parsed)) return undefined
    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        factId: String(item.factId ?? ''),
        statement: String(item.statement ?? ''),
        factType: String(item.factType ?? ''),
        confidence: Number(item.confidence ?? 0),
        priority: Number(item.priority ?? 0),
        score: Number(item.score ?? 0),
        source: item.source === 'related' ? 'related' : undefined
      }))
      .filter((item) => item.factId.length > 0 && item.statement.length > 0)
  } catch {
    return undefined
  }
}
