import { BrowserWindow } from 'electron'
import type { ArtifactBusEvent } from '../agent/runtime/types'
import type { ArtifactBus } from '../agent/runtime/ArtifactBus'
import type { StoredToolCall } from '../store'

export interface AgentBridgeCallbacks {
  getRunContext: (runId: string) => { chatId: string; threadId: string } | undefined
  onRunComplete?: (runId: string, chatId: string, threadId: string, finalText: string) => void
  onRunError?: (runId: string, chatId: string, threadId: string, error: string) => void
}

interface CollectedEntry {
  callId: string
  toolName: string
  arguments: string
  status: StoredToolCall['status'] | 'started'
  statusText?: string
  elapsedMs: number
  resultContent?: string
  error?: string
}

/**
 * Accumulates tool call data across ArtifactBus events so it can be
 * persisted to the store when a run completes.  Keyed by chatId:threadId
 * because a given thread can only have one active run at a time.
 */
export class ToolCallCollector {
  private entries = new Map<string, Map<string, CollectedEntry>>()

  private key(chatId: string, threadId: string): string {
    return `${chatId}:${threadId}`
  }

  private ensure(chatId: string, threadId: string): Map<string, CollectedEntry> {
    const k = this.key(chatId, threadId)
    let m = this.entries.get(k)
    if (!m) { m = new Map(); this.entries.set(k, m) }
    return m
  }

  recordInput(chatId: string, threadId: string, callId: string, toolId: string, args: Record<string, unknown>): void {
    const m = this.ensure(chatId, threadId)
    const prev = m.get(callId)
    m.set(callId, {
      callId,
      toolName: prev?.toolName ?? toolId,
      arguments: JSON.stringify(args),
      status: prev?.status ?? 'started',
      elapsedMs: prev?.elapsedMs ?? 0,
      statusText: prev?.statusText,
      resultContent: prev?.resultContent,
      error: prev?.error
    })
  }

  recordLifecycle(chatId: string, threadId: string, callId: string, toolId: string, status: string, elapsedMs: number, statusText?: string, error?: string): void {
    if (status !== 'completed' && status !== 'failed' && status !== 'cancelled') return
    const m = this.ensure(chatId, threadId)
    const prev = m.get(callId)
    m.set(callId, {
      callId,
      toolName: prev?.toolName ?? toolId,
      arguments: prev?.arguments ?? '{}',
      status: status as StoredToolCall['status'],
      statusText: statusText ?? prev?.statusText,
      elapsedMs,
      resultContent: prev?.resultContent,
      error: error ?? prev?.error
    })
  }

  recordResultText(chatId: string, threadId: string, callId: string, text: string): void {
    const m = this.entries.get(this.key(chatId, threadId))
    const entry = m?.get(callId)
    if (!entry) return
    entry.resultContent = entry.resultContent ? entry.resultContent + '\n' + text : text
  }

  drain(chatId: string, threadId: string): StoredToolCall[] {
    const k = this.key(chatId, threadId)
    const m = this.entries.get(k)
    if (!m) return []

    const result: StoredToolCall[] = []
    for (const e of m.values()) {
      if (e.status === 'started') continue
      result.push({
        callId: e.callId,
        toolName: e.toolName,
        arguments: e.arguments,
        status: e.status,
        statusText: e.statusText,
        elapsedMs: e.elapsedMs,
        result: {
          success: e.status === 'completed',
          content: e.resultContent,
          error: e.error
        }
      })
    }

    this.entries.delete(k)
    return result
  }
}

/**
 * Bridges ArtifactBus events into Electron IPC channels.
 * Emits both `agent:*` events (new) and legacy `chat:*` events
 * so the existing renderer continues to work.
 */
export function bridgeAgentEventsToIPC(bus: ArtifactBus, callbacks: AgentBridgeCallbacks, collector: ToolCallCollector): () => void {
  console.log('[ipc-bridge] subscribing to ArtifactBus events')
  return bus.subscribe((event) => {
    const runId = extractRunId(event)
    if (!runId) {
      console.warn('[ipc-bridge] event with no runId:', event.kind)
      return
    }

    const context = callbacks.getRunContext(runId)
    if (!context) {
      console.warn('[ipc-bridge] no chatId for runId:', runId, 'event:', event.kind)
      return
    }
    const { chatId, threadId } = context

    const wins = BrowserWindow.getAllWindows()
    if (wins.length === 0) {
      console.warn('[ipc-bridge] no windows found')
      return
    }

    const win = wins[0]
    if (event.kind !== 'stream_chunk' && event.kind !== 'thinking_chunk') {
      console.log('[ipc-bridge] forwarding event:', event.kind, 'chatId:', chatId)
    }

    switch (event.kind) {
      case 'stream_chunk':
        win.webContents.send('agent:stream-chunk', {
          chatId,
          threadId,
          runId: event.runId,
          chunk: event.chunk
        })
        win.webContents.send('chat:stream-chunk', {
          chatId,
          threadId,
          chunk: event.chunk
        })
        break

      case 'thinking_chunk':
        win.webContents.send('agent:thinking-chunk', {
          chatId,
          threadId,
          runId: event.runId,
          chunk: event.chunk
        })
        break

      case 'tool_lifecycle': {
        const le = event.event
        win.webContents.send('agent:tool-lifecycle', {
          chatId,
          threadId,
          runId: le.runId,
          agentId: le.agentId,
          callId: le.callId,
          toolId: le.toolId,
          toolName: le.toolId,
          status: le.status,
          statusText: le.statusText,
          phase: le.phase,
          percent: le.percent,
          elapsedMs: le.elapsedMs,
          preview: le.preview,
          error: le.error,
          timestamp: le.timestamp
        })
        collector.recordLifecycle(chatId, threadId, le.callId, le.toolId, le.status, le.elapsedMs, le.statusText, le.error)
        break
      }

      case 'artifact': {
        const ac = event.artifact.content
        if (ac.type === 'tool_input') {
          collector.recordInput(chatId, threadId, ac.callId, ac.toolId, ac.arguments)
        } else if (ac.type === 'tool_output_text') {
          win.webContents.send('agent:tool-result', {
            chatId,
            threadId,
            runId: event.artifact.runId,
            callId: ac.callId,
            toolId: ac.toolId,
            text: ac.text
          })
          collector.recordResultText(chatId, threadId, ac.callId, ac.text)
        } else if (ac.type === 'tool_output_image') {
          win.webContents.send('agent:image-attachment', {
            chatId,
            threadId,
            runId: event.artifact.runId,
            callId: ac.callId,
            mimeType: ac.mimeType,
            filePath: ac.filePath,
            alt: ac.alt
          })
        }
        break
      }

      case 'run_state_change':
        win.webContents.send('agent:run-state', {
          chatId,
          threadId,
          runId: event.runId,
          phase: event.phase,
          iteration: event.iteration
        })
        break

      case 'run_complete':
        win.webContents.send('agent:run-complete', {
          chatId,
          threadId,
          runId: event.runId,
          messageId: ''
        })
        callbacks.onRunComplete?.(event.runId, chatId, threadId, event.finalText)
        break

      case 'run_error':
        win.webContents.send('agent:run-error', {
          chatId,
          threadId,
          runId: event.runId,
          error: event.error
        })
        callbacks.onRunError?.(event.runId, chatId, threadId, event.error)
        break
    }
  })
}

function extractRunId(event: ArtifactBusEvent): string | undefined {
  switch (event.kind) {
    case 'stream_chunk':
    case 'thinking_chunk':
    case 'run_state_change':
    case 'run_complete':
    case 'run_error':
      return event.runId
    case 'tool_lifecycle':
      return event.event.runId
    case 'artifact':
      return event.artifact.runId
  }
}
