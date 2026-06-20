import { getToken } from './auth'
import type { Conversation, KnowledgeItem, Topic, Stats, Digest, ResearchConstraints } from '../types'

const BASE = ''

function headers(contentType = true): HeadersInit {
  const token = getToken()
  return {
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function api<T>(method: string, path: string, body?: object): Promise<T> {
  const res = await fetch(BASE + path, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? res.statusText)
  }
  return res.json() as Promise<T>
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authGoogle = (credential: string) => api<{ access_token: string; user: object }>('POST', '/auth/google', { credential })
export const getMe = () => api<object>('GET', '/auth/me')

// ── History ───────────────────────────────────────────────────────────────────
export const listHistory = (tag?: string): Promise<Conversation[]> =>
  api('GET', tag ? `/history?tag=${encodeURIComponent(tag)}` : '/history')
export const getHistory = (id: string) => api<{ thread_id: string; messages: object[]; tags: string[]; share: { token: string; views: number } | null }>('GET', `/history/${id}`)
export const deleteHistory = (id: string) => api('DELETE', `/history/${id}`)
export const searchHistory = (q: string, smart = true) => api<object[]>('GET', `/history/search?q=${encodeURIComponent(q)}&smart=${smart}`)
export const getAllTags = () => api<{ tag: string; count: number }[]>('GET', '/history/tags')
export const getStats = () => api<Stats>('GET', '/stats')

// ── Tags ──────────────────────────────────────────────────────────────────────
export const addTag = (threadId: string, tag: string) => api('POST', `/history/${threadId}/tags`, { tag })
export const removeTag = (threadId: string, tag: string) => api('DELETE', `/history/${threadId}/tags/${encodeURIComponent(tag)}`)

// ── Suggestions ───────────────────────────────────────────────────────────────
export const getSuggestions = (threadId: string) => api<{ questions: string[] }>('GET', `/history/${threadId}/suggestions`)

// ── Export ────────────────────────────────────────────────────────────────────
export async function exportReport(threadId: string, format: 'md' | 'pdf' | 'bib'): Promise<void> {
  const token = getToken()
  const res = await fetch(`/history/${threadId}/export?format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`Export failed: ${res.statusText}`)
  const blob = await res.blob()
  const ext = format === 'bib' ? 'bib' : format
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `report.${ext}`; a.click()
  URL.revokeObjectURL(url)
}

// ── Sharing ───────────────────────────────────────────────────────────────────
export const shareReport = (threadId: string) => api<{ token: string; url: string }>('POST', `/history/${threadId}/share`)
export const revokeShare = (threadId: string) => api('DELETE', `/history/${threadId}/share`)

// ── Monitor ───────────────────────────────────────────────────────────────────
export const listTopics = (): Promise<Topic[]> => api('GET', '/monitor/topics')
export const addTopic = (topic: string) => api('POST', '/monitor/topics', { topic })
export const removeTopic = (topic: string) => api('DELETE', `/monitor/topics/${encodeURIComponent(topic)}`)
export const syncAll = () => api<{ synced: Record<string, number> }>('POST', '/monitor/sync')
export const syncTopic = (topic: string) => api<{ topic: string; new_items: number }>('POST', `/monitor/sync/${encodeURIComponent(topic)}`)
export const getKnowledge = (topic?: string, limit = 50): Promise<{ items: KnowledgeItem[]; total: number }> => {
  const p = new URLSearchParams({ limit: String(limit) }); if (topic) p.set('topic', topic)
  return api('GET', `/monitor/knowledge?${p}`)
}
export const getDigest = () => api<Digest>('GET', '/monitor/digest')
export const markVisited = () => api('POST', '/monitor/visit')
export const analyzeJobPost = (job_description: string, auto_add = false) =>
  api<{ topics: string[]; role_summary: string; added?: string[]; total?: number }>(
    'POST', '/monitor/job-post', { job_description, auto_add }
  )

// ── File upload & URL fetch ───────────────────────────────────────────────────
export async function uploadFile(file: File): Promise<{ filename: string; chunks: number; docs: object[] }> {
  const token = getToken()
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? res.statusText)
  }
  return res.json()
}

export async function fetchUrl(url: string): Promise<{ url: string; chunks: number; docs: object[] }> {
  return api('POST', '/fetch-url', { url })
}

// ── SSE streaming ──────────────────────────────────────────────────────────────
export async function* streamResearch(
  query: string, audience: string, threadId?: string,
  constraints?: ResearchConstraints, docContext?: object[]
): AsyncGenerator<object> {
  const token = getToken()
  const res = await fetch('/research', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, audience, thread_id: threadId, constraints, doc_context: docContext ?? [] }),
  })
  if (!res.ok) throw new Error(`Research failed: ${res.statusText}`)
  yield* _readSSE(res)
}

export async function* streamResume(threadId: string): AsyncGenerator<object> {
  const token = getToken()
  const res = await fetch(`/resume/${threadId}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error(`Resume failed: ${res.statusText}`)
  yield* _readSSE(res)
}

async function* _readSSE(res: Response): AsyncGenerator<object> {
  const reader = res.body!.getReader(); const decoder = new TextDecoder(); let buffer = ''
  while (true) {
    const { done, value } = await reader.read(); if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data: ')) { try { yield JSON.parse(line.slice(6)) } catch { } }
    }
  }
}
