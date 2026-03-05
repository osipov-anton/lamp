import { useCallback, useMemo, useState } from 'react'
import { TooltipProvider } from './components/ui/tooltip'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { SettingsDialog } from './components/SettingsDialog'
import { IntegrationsView } from './components/IntegrationsView'
import { TelegramAuthDialog } from './components/TelegramAuthDialog'
import { CommandPalette } from './components/CommandPalette'
import { useChats } from './hooks/useChats'
import { useAgentRun } from './hooks/useAgentRun'
import { useHotkeys, type Hotkey } from './hooks/useHotkeys'

function App(): JSX.Element {
  const {
    chats,
    activeChat,
    activeMainThread,
    activeSideThread,
    sideThreads,
    openThreadId,
    setOpenThreadId,
    closeThread,
    activeChatId,
    setActiveChatId,
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
  } = useChats()

  const { run: mainRun } = useAgentRun(activeChatId, activeMainThread?.id ?? null)
  const { run: sideRun } = useAgentRun(activeChatId, activeSideThread?.id ?? null)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [telegramAuthOpen, setTelegramAuthOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  
  const [currentView, setCurrentView] = useState<'chat' | 'integrations'>('chat')

  const handleSelectChat = useCallback((id: string) => {
    setActiveChatId(id)
    setCurrentView('chat')
  }, [setActiveChatId])

  const handleNewChat = useCallback(() => {
    createChat()
    setCurrentView('chat')
  }, [createChat])

  const handleOpenSettings = useCallback(() => setSettingsOpen(true), [])
  const handleOpenIntegrations = useCallback(() => setCurrentView('integrations'), [])

  const hotkeys = useMemo<Hotkey[]>(
    () => [
      {
        key: 'k',
        meta: true,
        action: () => setCommandPaletteOpen((v) => !v)
      },
      {
        key: 'n',
        meta: true,
        action: handleNewChat,
        when: () => !commandPaletteOpen
      },
      {
        key: ',',
        meta: true,
        action: handleOpenSettings,
        when: () => !commandPaletteOpen
      },
      {
        key: 'i',
        meta: true,
        action: handleOpenIntegrations,
        when: () => !commandPaletteOpen
      },
      {
        key: 'Backspace',
        meta: true,
        action: () => {
          if (activeChatId) deleteChat(activeChatId)
        },
        when: () => !commandPaletteOpen && !!activeChatId
      },
      {
        key: '.',
        meta: true,
        action: () => stopStreaming(),
        when: () => !commandPaletteOpen && !!streamingChatId
      }
    ],
    [
      commandPaletteOpen,
      handleNewChat,
      handleOpenSettings,
      handleOpenIntegrations,
      activeChatId,
      deleteChat,
      stopStreaming,
      streamingChatId
    ]
  )

  useHotkeys(hotkeys)

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar
          chats={chats}
          activeChatId={activeChatId}
          currentView={currentView}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={deleteChat}
          onOpenSettings={handleOpenSettings}
          onOpenIntegrations={handleOpenIntegrations}
        />
        {currentView === 'chat' ? (
          <ChatView
            chat={activeChat}
            mainThread={activeMainThread}
            sideThread={activeSideThread}
            sideThreads={sideThreads}
            openThreadId={openThreadId}
            onOpenThread={setOpenThreadId}
            onCloseThread={closeThread}
            streamingChatId={streamingChatId}
            streamingThreadId={streamingThreadId}
            streamingContent={streamingContent}
            mainToolCalls={mainRun.toolCalls}
            sideToolCalls={sideRun.toolCalls}
            error={error}
            onSendMessage={sendMessage}
            onSendThreadMessage={sendThreadMessage}
            onStartThread={createThreadFromMessage}
            onStopStreaming={stopStreaming}
            onDismissError={dismissError}
            onNewChat={handleNewChat}
          />
        ) : (
          <IntegrationsView onOpenTelegramAuth={() => setTelegramAuthOpen(true)} />
        )}
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={deleteChat}
          onOpenSettings={handleOpenSettings}
          onOpenIntegrations={handleOpenIntegrations}
        />
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        <TelegramAuthDialog open={telegramAuthOpen} onOpenChange={setTelegramAuthOpen} />
      </div>
    </TooltipProvider>
  )
}

export default App
