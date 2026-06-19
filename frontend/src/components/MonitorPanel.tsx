import { useEffect, useState } from 'react'
import { listTopics, addTopic, removeTopic, syncAll, syncTopic, getKnowledge } from '../lib/api'
import type { Topic, KnowledgeItem } from '../types'

interface Props {
  onClose: () => void
}

export default function MonitorPanel({ onClose }: Props) {
  const [topics, setTopics] = useState<Topic[]>([])
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [activeTopic, setActiveTopic] = useState<string | null>(null)
  const [newTopic, setNewTopic] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncingTopic, setSyncingTopic] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listTopics(), getKnowledge()])
      .then(([t, k]) => {
        setTopics(t)
        setItems(k.items)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleAddTopic() {
    if (!newTopic.trim()) return
    await addTopic(newTopic.trim())
    const updated = await listTopics()
    setTopics(updated)
    setNewTopic('')
  }

  async function handleRemoveTopic(topic: string) {
    await removeTopic(topic)
    setTopics(prev => prev.filter(t => t.topic !== topic))
    if (activeTopic === topic) setActiveTopic(null)
  }

  async function handleSyncAll() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await syncAll()
      const total = Object.values(result.synced).reduce((a, b) => a + b, 0)
      setSyncResult(`Synced ${topics.length} topics — ${total} new items found`)
      const k = await getKnowledge()
      setItems(k.items)
    } finally {
      setSyncing(false)
    }
  }

  async function handleSyncTopic(topic: string) {
    setSyncingTopic(topic)
    try {
      const result = await syncTopic(topic)
      setSyncResult(`"${topic}" — ${result.new_items} new items`)
      const k = await getKnowledge(activeTopic ?? undefined)
      setItems(k.items)
    } finally {
      setSyncingTopic(null)
    }
  }

  async function handleTopicClick(topic: string) {
    const t = activeTopic === topic ? null : topic
    setActiveTopic(t)
    const k = await getKnowledge(t ?? undefined)
    setItems(k.items)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          <h2 className="font-semibold text-white">Knowledge Monitor</h2>
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        {/* Add topic */}
        <section>
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Track a topic</h3>
          <div className="flex gap-2">
            <input
              className="input-base flex-1 text-sm"
              placeholder="e.g. LoRA fine-tuning"
              value={newTopic}
              onChange={e => setNewTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddTopic()}
            />
            <button onClick={handleAddTopic} className="btn-primary text-sm px-3">Add</button>
          </div>
        </section>

        {/* Sync controls */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-muted uppercase tracking-wider">Tracked topics</h3>
            <button
              onClick={handleSyncAll}
              disabled={syncing || topics.length === 0}
              className="text-xs btn-ghost py-1 px-2 flex items-center gap-1"
            >
              {syncing ? (
                <>
                  <span className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
                  Syncing…
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Sync all
                </>
              )}
            </button>
          </div>

          {syncResult && (
            <p className="text-xs text-green-400 mb-2">{syncResult}</p>
          )}

          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : topics.length === 0 ? (
            <p className="text-sm text-muted">No topics tracked yet. Add one above.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {topics.map(t => (
                <div
                  key={t.topic}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    activeTopic === t.topic ? 'bg-accent/15 border-accent/40' : 'bg-panel border-border hover:bg-card'
                  }`}
                  onClick={() => handleTopicClick(t.topic)}
                >
                  <span className="flex-1 text-sm text-white">{t.topic}</span>
                  <button
                    onClick={e => { e.stopPropagation(); handleSyncTopic(t.topic) }}
                    disabled={syncingTopic === t.topic}
                    className="text-muted hover:text-accent p-1 rounded transition-colors"
                    title="Sync now"
                  >
                    {syncingTopic === t.topic ? (
                      <span className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin block" />
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleRemoveTopic(t.topic) }}
                    className="text-muted hover:text-red-400 p-1 rounded transition-colors"
                    title="Remove topic"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Knowledge items */}
        <section>
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            {activeTopic ? `Knowledge: ${activeTopic}` : 'All knowledge items'}
            <span className="ml-2 text-accent font-mono">{items.length}</span>
          </h3>
          {items.length === 0 ? (
            <p className="text-sm text-muted">
              {activeTopic ? 'No items for this topic yet. Try syncing.' : 'No items yet. Sync a topic to start learning!'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map(item => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-3 bg-panel border border-border rounded-lg hover:border-accent/50 transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono shrink-0 mt-0.5 ${
                      item.item_type === 'arxiv' ? 'bg-red-500/20 text-red-300' : 'bg-blue-500/20 text-blue-300'
                    }`}>
                      {item.item_type}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-white group-hover:text-accent transition-colors leading-snug line-clamp-2">
                        {item.title}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        {new Date(item.discovered_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
