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
  const [pendingQuery, setPendingQuery] = useState<string | undefined>()
  const [navOpen, setNavOpen] = useState(false)   // mobile drawer

  if (!user) {
    return <Login onLogin={login} />
  }

  function handleNewChat() {
    setActiveThreadId(undefined)
    setLoadThreadId(undefined)
    setPendingQuery(undefined)
    setChatKey(n => n + 1)   // force Chat remount → clears messages state
    setView('chat')
    setNavOpen(false)
  }

  function handleDeepDive(query: string) {
    setActiveThreadId(undefined)
    setLoadThreadId(undefined)
    setPendingQuery(query)
    setChatKey(n => n + 1)   // fresh Chat that auto-runs the query
    setView('chat')
    setNavOpen(false)
  }

  function handleSelectConversation(threadId: string) {
    setActiveThreadId(threadId)
    setLoadThreadId(threadId)
    setView('chat')
    setNavOpen(false)
  }

  function handleConversationCreated() {
    setHistoryRefresh(n => n + 1)
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* Mobile drawer toggle */}
      <button
        className="mobile-nav-toggle"
        aria-label="Open navigation"
        onClick={() => setNavOpen(true)}
      >☰</button>

      {/* Backdrop shown when drawer is open on mobile */}
      <div
        className={`sidebar-overlay${navOpen ? ' show' : ''}`}
        onClick={() => setNavOpen(false)}
      />

      <Sidebar
        user={user}
        onLogout={logout}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        activeThreadId={activeThreadId}
        refreshTrigger={historyRefresh}
        onOpenMonitor={() => { setView('monitor'); setNavOpen(false) }}
        onOpenDashboard={() => { setView('dashboard'); setNavOpen(false) }}
        open={navOpen}
      />

      <main style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, height: '100%' }}>
          {view === 'monitor' && (
            <MonitorPanel onClose={handleNewChat} onDeepDive={handleDeepDive} />
          )}
          {view === 'dashboard' && (
            <Dashboard onClose={handleNewChat} />
          )}
          {view === 'chat' && (
            <Chat
              key={chatKey}
              onConversationCreated={handleConversationCreated}
              loadThreadId={loadThreadId}
              initialQuery={pendingQuery}
            />
          )}
        </div>
      </main>
    </div>
  )
}
