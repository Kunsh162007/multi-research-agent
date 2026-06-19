import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import Login from './components/Login'
import Chat from './components/Chat'
import Sidebar from './components/Sidebar'
import MonitorPanel from './components/MonitorPanel'
import Dashboard from './components/Dashboard'

type MainView = 'chat' | 'monitor' | 'dashboard'

export default function App() {
  const { user, login, logout } = useAuth()
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>()
  const [loadThreadId, setLoadThreadId] = useState<string | undefined>()
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const [view, setView] = useState<MainView>('chat')

  if (!user) {
    return <Login onLogin={login} />
  }

  function handleNewChat() {
    setActiveThreadId(undefined)
    setLoadThreadId(undefined)
    setView('chat')
  }

  function handleSelectConversation(threadId: string) {
    setActiveThreadId(threadId)
    setLoadThreadId(threadId)
    setView('chat')
  }

  function handleConversationCreated() {
    setHistoryRefresh(n => n + 1)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar
        user={user}
        onLogout={logout}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        activeThreadId={activeThreadId}
        refreshTrigger={historyRefresh}
        onOpenMonitor={() => setView('monitor')}
        onOpenDashboard={() => setView('dashboard')}
      />

      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {view === 'monitor' && (
            <MonitorPanel onClose={handleNewChat} />
          )}
          {view === 'dashboard' && (
            <Dashboard onClose={handleNewChat} />
          )}
          {view === 'chat' && (
            <Chat
              onConversationCreated={handleConversationCreated}
              loadThreadId={loadThreadId}
            />
          )}
        </div>
      </main>
    </div>
  )
}
