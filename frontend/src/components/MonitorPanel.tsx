import { useEffect, useState } from 'react'
import { listTopics, addTopic, removeTopic, syncAll, syncTopic, getKnowledge } from '../lib/api'
import type { Topic, KnowledgeItem } from '../types'

interface Props { onClose: () => void }

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
      .then(([t, k]) => { setTopics(t); setItems(k.items) })
      .finally(() => setLoading(false))
  }, [])

  async function handleAddTopic() {
    if (!newTopic.trim()) return
    await addTopic(newTopic.trim())
    setTopics(await listTopics())
    setNewTopic('')
  }

  async function handleRemoveTopic(topic: string) {
    await removeTopic(topic)
    setTopics(prev => prev.filter(t => t.topic !== topic))
    if (activeTopic === topic) setActiveTopic(null)
  }

  async function handleSyncAll() {
    setSyncing(true); setSyncResult(null)
    try {
      const result = await syncAll()
      const total = Object.values(result.synced).reduce((a, b) => a + b, 0)
      setSyncResult(`Synced ${topics.length} topics — ${total} new items`)
      setItems((await getKnowledge()).items)
    } finally { setSyncing(false) }
  }

  async function handleSyncTopic(topic: string) {
    setSyncingTopic(topic)
    try {
      const result = await syncTopic(topic)
      setSyncResult(`"${topic}" — ${result.new_items} new items`)
      setItems((await getKnowledge(activeTopic ?? undefined)).items)
    } finally { setSyncingTopic(null) }
  }

  async function handleTopicClick(topic: string) {
    const t = activeTopic === topic ? null : topic
    setActiveTopic(t)
    setItems((await getKnowledge(t ?? undefined)).items)
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#0c0c0c' }}>
      {/* Header */}
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid rgba(212,168,71,0.1)' }}>
        <div className="flex items-center justify-between">
          <p style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.25em', textTransform: 'uppercase' }}>
            ◆ &nbsp; Knowledge Monitor
          </p>
          <button
            onClick={onClose}
            style={{ fontSize: '10px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(245,240,232,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'color 0.2s', background: 'none', border: 'none' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(245,240,232,0.7)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(245,240,232,0.3)' }}
          >
            Close ×
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-6" style={{ padding: '20px 28px' }}>

        {/* Add topic */}
        <section>
          <p style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px' }}>
            Track Topic
          </p>
          <div className="flex gap-2">
            <div
              className="gold-input-row flex-1 flex items-center gap-2"
              style={{ padding: '8px 0' }}
            >
              <span style={{ color: 'rgba(212,168,71,0.35)', fontSize: '12px', flexShrink: 0 }}>◆</span>
              <input
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'rgba(245,240,232,0.8)', fontSize: '13px', fontFamily: 'Georgia, serif', caretColor: '#d4a847' }}
                placeholder="e.g. LoRA fine-tuning…"
                value={newTopic}
                onChange={e => setNewTopic(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddTopic()}
              />
            </div>
            <button onClick={handleAddTopic} className="btn-primary">Add</button>
          </div>
        </section>

        {/* Topics list */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              Tracked Topics
            </p>
            <button
              onClick={handleSyncAll}
              disabled={syncing || topics.length === 0}
              style={{
                fontSize: '10px', fontFamily: "'Segoe UI', system-ui, sans-serif",
                letterSpacing: '0.1em', textTransform: 'uppercase',
                border: '1px solid rgba(212,168,71,0.2)',
                color: 'rgba(212,168,71,0.5)', background: 'transparent',
                padding: '4px 12px', cursor: 'pointer', transition: 'all 0.2s',
                opacity: (syncing || topics.length === 0) ? 0.4 : 1,
              }}
            >
              {syncing ? (
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 bg-accent typing-dot" />
                  <span className="w-1 h-1 bg-accent typing-dot" />
                  <span className="w-1 h-1 bg-accent typing-dot" />
                </span>
              ) : 'Sync All'}
            </button>
          </div>

          {syncResult && (
            <p style={{ fontSize: '12px', color: '#d4a847', fontFamily: "'Segoe UI', system-ui, sans-serif", marginBottom: '10px' }}>
              ◆ {syncResult}
            </p>
          )}

          {loading ? (
            <div className="flex gap-1.5 py-2">
              <span className="w-1.5 h-1.5 bg-accent typing-dot" />
              <span className="w-1.5 h-1.5 bg-accent typing-dot" />
              <span className="w-1.5 h-1.5 bg-accent typing-dot" />
            </div>
          ) : topics.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'rgba(245,240,232,0.25)', fontFamily: "'Segoe UI', system-ui, sans-serif", fontStyle: 'italic' }}>
              No topics tracked. Add one above.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {topics.map(t => (
                <div
                  key={t.topic}
                  className="flex items-center gap-2 cursor-pointer transition-all"
                  style={{
                    padding: '10px 14px',
                    border: `1px solid ${activeTopic === t.topic ? 'rgba(212,168,71,0.4)' : 'rgba(212,168,71,0.1)'}`,
                    background: activeTopic === t.topic ? 'rgba(212,168,71,0.05)' : 'transparent',
                  }}
                  onClick={() => handleTopicClick(t.topic)}
                >
                  <span style={{ fontSize: '10px', color: activeTopic === t.topic ? '#d4a847' : 'rgba(212,168,71,0.2)', flexShrink: 0 }}>◆</span>
                  <span style={{ flex: 1, fontSize: '13px', color: activeTopic === t.topic ? 'rgba(245,240,232,0.8)' : 'rgba(245,240,232,0.45)', fontFamily: "'Segoe UI', system-ui, sans-serif" }} className="truncate">{t.topic}</span>
                  <button
                    onClick={e => { e.stopPropagation(); handleSyncTopic(t.topic) }}
                    disabled={syncingTopic === t.topic}
                    style={{ fontSize: '10px', color: 'rgba(212,168,71,0.35)', cursor: 'pointer', background: 'none', border: 'none', padding: '0 4px', transition: 'color 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#d4a847' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(212,168,71,0.35)' }}
                    title="Sync now"
                  >
                    {syncingTopic === t.topic ? '…' : '↻'}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleRemoveTopic(t.topic) }}
                    style={{ fontSize: '14px', color: 'rgba(245,240,232,0.2)', cursor: 'pointer', background: 'none', border: 'none', padding: '0 4px', transition: 'color 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(245,240,232,0.6)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(245,240,232,0.2)' }}
                    title="Remove topic"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Knowledge items */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <p style={{ fontSize: '9px', fontFamily: "'Segoe UI', system-ui, sans-serif", color: 'rgba(212,168,71,0.4)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              {activeTopic ? `Knowledge — ${activeTopic}` : 'All Knowledge'}
            </p>
            <span style={{ fontSize: '10px', fontFamily: 'Georgia, serif', color: 'rgba(212,168,71,0.5)' }}>[{items.length}]</span>
          </div>
          {items.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'rgba(245,240,232,0.25)', fontFamily: "'Segoe UI', system-ui, sans-serif", fontStyle: 'italic' }}>
              {activeTopic ? 'No items for this topic. Try syncing.' : 'No items yet. Sync a topic.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map(item => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block transition-all"
                  style={{ padding: '12px 14px', border: '1px solid rgba(212,168,71,0.1)', textDecoration: 'none' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(212,168,71,0.3)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(212,168,71,0.1)' }}
                >
                  <div className="flex items-start gap-3">
                    <span style={{
                      fontSize: '10px', padding: '2px 8px',
                      border: `1px solid ${item.item_type === 'arxiv' ? 'rgba(212,168,71,0.4)' : 'rgba(212,168,71,0.2)'}`,
                      color: item.item_type === 'arxiv' ? '#d4a847' : 'rgba(212,168,71,0.5)',
                      fontFamily: "'Segoe UI', system-ui, sans-serif",
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      flexShrink: 0, marginTop: '1px',
                    }}>
                      {item.item_type}
                    </span>
                    <div className="min-w-0">
                      <p style={{ fontSize: '13px', color: 'rgba(245,240,232,0.65)', lineHeight: 1.45 }} className="line-clamp-2">
                        {item.title}
                      </p>
                      <p style={{ fontSize: '10px', color: 'rgba(212,168,71,0.3)', marginTop: '4px', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
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
