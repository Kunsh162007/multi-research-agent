import { useState, useCallback, useRef } from 'react'
import { streamResearch, streamResume } from '../lib/api'
import type { SSEEvent, FinalEvent, StateEvent, Source, SourcesEvent } from '../types'

export interface StreamState {
  events: SSEEvent[]
  report: string
  isStreaming: boolean
  quality: number
  iteration: number
  threadId?: string
  error?: string
  sources: Source[]
}

export function useSSE() {
  const [state, setState] = useState<StreamState>({
    events: [],
    report: '',
    isStreaming: false,
    quality: 0,
    iteration: 0,
    sources: [],
  })
  const abortRef = useRef(false)

  const reset = useCallback(() => {
    abortRef.current = true
    setState({ events: [], report: '', isStreaming: false, quality: 0, iteration: 0, sources: [] })
  }, [])

  const start = useCallback(
    async (query: string, audience: string, threadId?: string, constraints?: object, docContext?: object[]) => {
      abortRef.current = false
      setState({ events: [], report: '', isStreaming: true, quality: 0, iteration: 0, sources: [] })

      try {
        for await (const event of streamResearch(query, audience, threadId, constraints as any, docContext)) {
          if (abortRef.current) break
          _handleEvent(event as SSEEvent, setState)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setState(prev => ({ ...prev, isStreaming: false, error: msg }))
      } finally {
        setState(prev => ({ ...prev, isStreaming: false }))
      }
    },
    [],
  )

  const resume = useCallback(async (threadId: string) => {
    abortRef.current = false
    setState({ events: [], report: '', isStreaming: true, quality: 0, iteration: 0, sources: [] })

    try {
      for await (const event of streamResume(threadId)) {
        if (abortRef.current) break
        _handleEvent(event as SSEEvent, setState)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setState(prev => ({ ...prev, isStreaming: false, error: msg }))
    } finally {
      setState(prev => ({ ...prev, isStreaming: false }))
    }
  }, [])

  return { state, start, resume, reset }
}

function _handleEvent(event: SSEEvent, setState: React.Dispatch<React.SetStateAction<StreamState>>) {
  setState(prev => {
    const next = { ...prev, events: [...prev.events, event] }
    switch (event.type) {
      case 'token':
        next.report = prev.report + event.text
        break
      case 'state':
        next.quality = (event as StateEvent).quality
        next.iteration = (event as StateEvent).iteration
        break
      case 'final':
        next.report = (event as FinalEvent).report
        next.threadId = (event as FinalEvent).thread_id
        next.isStreaming = false
        break
      case 'sources': {
        const incoming = (event as SourcesEvent).sources
        const seen = new Set(prev.sources.map(s => s.url))
        const merged = [...prev.sources, ...incoming.filter(s => s.url && !seen.has(s.url))]
        next.sources = merged
        break
      }
      case 'error':
        next.isStreaming = false
        next.error = event.message
        break
    }
    return next
  })
}
