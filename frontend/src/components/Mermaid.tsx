import { useEffect, useRef, useState } from 'react'

let _id = 0
let _mermaid: typeof import('mermaid').default | null = null

async function getMermaid() {
  if (!_mermaid) {
    _mermaid = (await import('mermaid')).default
    _mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' })
  }
  return _mermaid
}

/**
 * Renders a Mermaid diagram source string to inline SVG (mermaid is lazy-loaded).
 *
 * `enabled` is false while the report is still streaming — diagram source arrives
 * a few characters at a time, so rendering mid-stream would parse an incomplete
 * block and make mermaid inject its "Syntax error in text" graphic. While disabled
 * (or if a finished block is genuinely invalid) we show the raw source instead.
 */
export default function Mermaid({ chart, enabled = true }: { chart: string; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!enabled || !chart.trim()) return
    let cancelled = false
    const id = `mmd-${++_id}`
    getMermaid()
      .then(async m => {
        // parse first with suppressErrors so an invalid block fails quietly,
        // without mermaid appending an error diagram to the document.
        const ok = await m.parse(chart, { suppressErrors: true })
        if (!ok) throw new Error('invalid mermaid syntax')
        return m.render(id, chart)
      })
      .then(res => {
        if (!cancelled && res && ref.current) {
          ref.current.innerHTML = res.svg
          setError(false)
        }
      })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [chart, enabled])

  if (!enabled || error) {
    return <pre className="mermaid-fallback"><code>{chart}</code></pre>
  }
  return <div className="mermaid-diagram" ref={ref} />
}
