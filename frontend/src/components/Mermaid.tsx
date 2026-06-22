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

/** Renders a Mermaid diagram source string to inline SVG (mermaid is lazy-loaded). */
export default function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const id = `mmd-${++_id}`
    getMermaid()
      .then(m => m.render(id, chart))
      .then(({ svg }) => { if (!cancelled && ref.current) { ref.current.innerHTML = svg; setError(false) } })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [chart])

  if (error) {
    return <pre className="mermaid-fallback"><code>{chart}</code></pre>
  }
  return <div className="mermaid-diagram" ref={ref} />
}
