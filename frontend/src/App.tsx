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
  const [chatKey, setChatKey] = useState(0)

  if (!user) {
    return <Login onLogin={login} />
  }

  function handleNewChat() {
    setActiveThreadId(undefined)
    setLoadThreadId(undefined)
    setChatKey(n => n + 1)   // force Chat remount → clears messages state
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
    <div className="flex h-screen overflow-hidden" style={{ background: 'transparent' }}>
      {/* Design A — floating particles */}
      {[
        { size: 3, left: '15%', duration: '18s', delay: '0s' },
        { size: 2, left: '35%', duration: '22s', delay: '4s' },
        { size: 4, left: '58%', duration: '16s', delay: '8s' },
        { size: 2, left: '78%', duration: '20s', delay: '2s' },
        { size: 3, left: '90%', duration: '24s', delay: '6s' },
      ].map((p, i) => (
        <div
          key={i}
          className="particle"
          style={{ width: p.size, height: p.size, left: p.left, animationDuration: p.duration, animationDelay: p.delay }}
        />
      ))}

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
              key={chatKey}
              onConversationCreated={handleConversationCreated}
              loadThreadId={loadThreadId}
            />
          )}
        </div>
      </main>
    </div>
  )
}
