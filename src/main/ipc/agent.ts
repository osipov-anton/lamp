import { BrowserWindow } from 'electron'
import type { ArtifactBusEvent } from '../agent/runtime/types'
import type { ArtifactBus } from '../agent/runtime/ArtifactBus'

export interface AgentBridgeCallbacks {
  getRunContext: (runId: string) => { chatId: string; threadId: string } | undefined
  onRunComplete?: (runId: string, chatId: string, threadId: string, finalText: string) => void
  onRunError?: (runId: string, chatId: string, threadId: string, error: string) => void
}

/**
 * Bridges ArtifactBus events into Electron IPC channels.
 * Emits both `agent:*` events (new) and legacy `chat:*` events
 * so the existing renderer continues to work.
 */
export function bridgeAgentEventsToIPC(bus: ArtifactBus, callbacks: AgentBridgeCallbacks): () => void {
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

      case 'tool_lifecycle':
        win.webContents.send('agent:tool-lifecycle', {
          chatId,
          threadId,
          runId: event.event.runId,
          agentId: event.event.agentId,
          callId: event.event.callId,
          toolId: event.event.toolId,
          toolName: event.event.toolId,
          status: event.event.status,
          statusText: event.event.statusText,
          phase: event.event.phase,
          percent: event.event.percent,
          elapsedMs: event.event.elapsedMs,
          preview: event.event.preview,
          timestamp: event.event.timestamp
        })
        break

      case 'artifact':
        if (event.artifact.content.type === 'tool_output_text') {
          win.webContents.send('agent:tool-result', {
            chatId,
            threadId,
            runId: event.artifact.runId,
            callId: event.artifact.content.callId,
            toolId: event.artifact.content.toolId,
            text: event.artifact.content.text
          })
        } else if (event.artifact.content.type === 'tool_output_image') {
          win.webContents.send('agent:image-attachment', {
            chatId,
            threadId,
            runId: event.artifact.runId,
            callId: event.artifact.content.callId,
            mimeType: event.artifact.content.mimeType,
            filePath: event.artifact.content.filePath,
            alt: event.artifact.content.alt
          })
        }
        break

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
