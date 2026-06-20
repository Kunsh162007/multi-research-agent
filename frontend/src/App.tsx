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
      {/* Ambient orange glow particles */}
      {[
        { size: 2, left: '12%', duration: '20s', delay: '0s' },
        { size: 3, left: '38%', duration: '25s', delay: '5s' },
        { size: 2, left: '62%', duration: '18s', delay: '9s' },
        { size: 4, left: '80%', duration: '22s', delay: '3s' },
      ].map((p, i) => (
        <div
          key={i}
          className="particle"
          style={{ width: p.size, height: p.size, left: p.left, animationDuration: p.duration, animationDelay: p.delay, background: 'rgba(249,115,22,0.5)' }}
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

      <main style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, height: '100%' }}>
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
