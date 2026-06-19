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
    <div className="flex flex-col h-full bg-surface font-mono">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 shrink-0"
        style={{ borderBottom: '1px solid rgba(0,255,225,0.15)' }}
      >
        <span className="text-xs text-accent tracking-widest">// KNOWLEDGE_MONITOR</span>
        <button
          onClick={onClose}
          className="text-xs text-dim-cyan hover:text-magenta transition-colors"
        >
          [×] CLOSE
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
        {/* Add topic */}
        <section>
          <p className="text-xs text-dim-cyan tracking-widest mb-2">// TRACK_TOPIC</p>
          <div className="flex gap-2">
            <div
              className="flex-1 flex items-center gap-2 px-3"
              style={{ border: '1px solid rgba(0,255,225,0.25)' }}
            >
              <span className="text-magenta text-xs">$&gt;</span>
              <input
                className="flex-1 bg-transparent text-accent text-xs py-2 focus:outline-none placeholder-dim-cyan"
                placeholder="e.g. LoRA fine-tuning"
                value={newTopic}
                onChange={e => setNewTopic(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddTopic()}
              />
            </div>
            <button
              onClick={handleAddTopic}
              className="btn-primary px-3"
            >
              ADD
            </button>
          </div>
        </section>

        {/* Sync controls */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-dim-cyan tracking-widest">// TRACKED_TOPICS</p>
            <button
              onClick={handleSyncAll}
              disabled={syncing || topics.length === 0}
              className="text-xs text-dim-cyan hover:text-accent disabled:opacity-40 transition-colors"
              style={{ border: '1px solid rgba(0,255,225,0.15)', padding: '2px 8px' }}
            >
              {syncing ? (
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 bg-accent typing-dot" />
                  <span className="w-1 h-1 bg-accent typing-dot" />
                  <span className="w-1 h-1 bg-accent typing-dot" />
                </span>
              ) : '[SYNC_ALL]'}
            </button>
          </div>

          {syncResult && (
            <p className="text-xs text-accent mb-2">&gt; {syncResult}</p>
          )}

          {loading ? (
            <p className="text-xs text-dim-cyan">LOADING...</p>
          ) : topics.length === 0 ? (
            <p className="text-xs text-dim-cyan">&gt; no topics tracked. add one above.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {topics.map(t => (
                <div
                  key={t.topic}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-all"
                  style={{
                    border: `1px solid ${activeTopic === t.topic ? '#00ffe1' : 'rgba(0,255,225,0.15)'}`,
                    boxShadow: activeTopic === t.topic ? '0 0 8px rgba(0,255,225,0.2)' : 'none',
                    background: activeTopic === t.topic ? 'rgba(0,255,225,0.05)' : 'transparent',
                  }}
                  onClick={() => handleTopicClick(t.topic)}
                >
                  <span
                    className="text-xs shrink-0"
                    style={{ color: activeTopic === t.topic ? '#00ffe1' : '#1e4a44' }}
                  >
                    ▶
                  </span>
                  <span className="flex-1 text-xs text-accent truncate">{t.topic}</span>
                  <button
                    onClick={e => { e.stopPropagation(); handleSyncTopic(t.topic) }}
                    disabled={syncingTopic === t.topic}
                    className="text-xs text-dim-cyan hover:text-accent transition-colors px-1"
                    title="Sync now"
                  >
                    {syncingTopic === t.topic ? (
                      <span className="flex gap-0.5">
                        <span className="w-1 h-1 bg-accent typing-dot" />
                        <span className="w-1 h-1 bg-accent typing-dot" />
                      </span>
                    ) : '[↻]'}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleRemoveTopic(t.topic) }}
                    className="text-xs text-dim-cyan hover:text-magenta transition-colors px-1"
                    title="Remove topic"
                  >
                    [×]
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Knowledge items */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs text-dim-cyan tracking-widest">
              {activeTopic ? `// KNOWLEDGE: ${activeTopic.toUpperCase()}` : '// ALL_KNOWLEDGE'}
            </p>
            <span className="text-xs text-accent">[{items.length}]</span>
          </div>
          {items.length === 0 ? (
            <p className="text-xs text-dim-cyan">
              &gt; {activeTopic ? 'no items for this topic. try syncing.' : 'no items yet. sync a topic.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map(item => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-3 transition-all group"
                  style={{ border: '1px solid rgba(0,255,225,0.15)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#00ffe1'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 8px rgba(0,255,225,0.15)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,255,225,0.15)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="text-xs px-1.5 py-0.5 shrink-0 mt-0.5"
                      style={{
                        border: `1px solid ${item.item_type === 'arxiv' ? 'rgba(255,45,120,0.4)' : 'rgba(0,255,225,0.3)'}`,
                        color: item.item_type === 'arxiv' ? '#ff2d78' : '#00ffe1',
                      }}
                    >
                      {item.item_type.toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-accent group-hover:text-accent leading-snug line-clamp-2 transition-colors">
                        {item.title}
                      </p>
                      <p className="text-xs text-dim-cyan mt-1">
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
