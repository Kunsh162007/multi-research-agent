export interface User {
  google_id: string; email: string; name: string; picture: string
}

export type SSEEventType = 'step' | 'token' | 'state' | 'final' | 'error' | 'sources'
export interface StepEvent    { type: 'step';    node: string; detail: string }
export interface TokenEvent   { type: 'token';   text: string }
export interface StateEvent   { type: 'state';   iteration: number; quality: number }
export interface FinalEvent   { type: 'final';   report: string; validation: Validation; thread_id: string }
export interface ErrorEvent   { type: 'error';   message: string }
export interface Source       { url: string; title: string; source_type: string; credibility?: number; signals?: string[] }
export interface SourcesEvent { type: 'sources'; sources: Source[] }
export type SSEEvent = StepEvent | TokenEvent | StateEvent | FinalEvent | ErrorEvent | SourcesEvent

export interface Validation {
  accuracy?: number; completeness?: number; clarity?: number
  overall?: number; summary?: string
  follow_up_questions?: string[]
}

export interface ChatMessage {
  id: string; role: 'user' | 'assistant'; content: string
  events: SSEEvent[]; thread_id?: string; timestamp: Date
  isStreaming: boolean; validation?: Validation; report?: string; sources?: Source[]
}

export interface Conversation {
  thread_id: string; title: string; created_at: string; updated_at: string
}

export interface KnowledgeItem {
  id: number; topic: string; title: string; content: string
  source: string; url: string; discovered_at: string; item_type: 'arxiv' | 'web'
}

export interface Topic { topic: string; created_at: string }

export interface TagItem { tag: string; count: number }

export interface ShareInfo { token: string; views: number }

export interface Stats {
  total_conversations: number
  total_reports: number
  total_tags: number
  recent: { title: string; updated_at: string }[]
  top_tags: TagItem[]
  activity: { date: string; count: number }[]
  monitor: { topics: number; knowledge_items: number }
}

export interface DigestItem { id: number; topic: string; title: string; url: string; discovered_at: string; item_type: string }
export interface Digest { since: string; total_new: number; by_topic: Record<string, DigestItem[]> }

export type ResearchMode = 'validate' | 'discover' | 'explain' | 'research'

export interface ResearchConstraints {
  mode?: ResearchMode
  use_hyde?: boolean
  use_rag_fusion?: boolean
  use_storm?: boolean
  use_adaptive?: boolean
  use_reflexion?: boolean
  max_iterations?: number
  quality_target?: number
}
