import { useCallback, useMemo, useState } from 'react'
import { TooltipProvider } from './components/ui/tooltip'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { SettingsDialog } from './components/SettingsDialog'
import { IntegrationsView } from './components/IntegrationsView'
import { MemoryView } from './components/MemoryView'
import { AgentsView } from './components/AgentsView'
import { TelegramAuthDialog } from './components/TelegramAuthDialog'
import { GoogleAuthDialog } from './components/GoogleAuthDialog'
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
  const [googleAuthOpen, setGoogleAuthOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  
  const [currentView, setCurrentView] = useState<'chat' | 'integrations' | 'memory' | 'agents'>('chat')

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
  const handleOpenMemory = useCallback(() => setCurrentView('memory'), [])
  const handleOpenAgents = useCallback(() => setCurrentView('agents'), [])

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
        key: 'm',
        meta: true,
        action: handleOpenMemory,
        when: () => !commandPaletteOpen
      },
      {
        key: 'g',
        meta: true,
        action: handleOpenAgents,
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
      handleOpenMemory,
      handleOpenAgents,
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
          onOpenMemory={handleOpenMemory}
          onOpenAgents={handleOpenAgents}
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
        ) : currentView === 'memory' ? (
          <MemoryView />
        ) : currentView === 'agents' ? (
          <AgentsView />
        ) : (
          <IntegrationsView
            onOpenTelegramAuth={() => setTelegramAuthOpen(true)}
            onOpenGoogleAuth={() => setGoogleAuthOpen(true)}
          />
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
        <GoogleAuthDialog open={googleAuthOpen} onOpenChange={setGoogleAuthOpen} />
      </div>
    </TooltipProvider>
  )
}

export default App
