import { ipcMain } from 'electron'
import type { MemoryGraphPort, MessageMemoryDocument } from '../storage/ports/MemoryGraphPort'
import { getChats } from '../store'

export function registerMemoryHandlers(memoryGraph: MemoryGraphPort): void {
  ipcMain.handle('memory:list-facts', (_event, options?: { includeArchived?: boolean }) => {
    return memoryGraph.listAllFacts(options)
  })

  ipcMain.handle('memory:list-entities', () => {
    return memoryGraph.listAllEntities()
  })

  ipcMain.handle('memory:delete-fact', (_event, factId: string) => {
    return memoryGraph.deleteFact(factId)
  })

  ipcMain.handle('memory:delete-entity', (_event, entityId: string) => {
    return memoryGraph.deleteEntity(entityId)
  })

  ipcMain.handle('memory:reindex', async () => {
    console.log('[memory] full reindex started')

    const allMessages: MessageMemoryDocument[] = getChats().flatMap((chat) =>
      chat.threads.flatMap((thread) =>
        thread.messages.map((message) => ({
          chatId: chat.id,
          threadId: thread.id,
          chatTitle: chat.title,
          messageId: message.id,
          role: message.role,
          content: message.content,
          senderName: message.role === 'assistant' ? 'assistant' : 'user',
          channelType: 'local_chat' as const,
          channelExternalId: '',
          timestamp: message.timestamp
        }))
      )
    )

    await memoryGraph.rebuildMessages(allMessages)
    const { facts, entities } = await memoryGraph.reindexEmbeddings()

    console.log(`[memory] full reindex done: ${allMessages.length} messages, ${facts} facts, ${entities} entities`)
    return { messages: allMessages.length, facts, entities }
  })
}
