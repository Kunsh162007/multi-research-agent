import { useEffect, useState } from 'react'
import { COMMANDS, matchCommands, type SlashCommand } from '../lib/commands'

interface Props {
  /** Current input text (used to filter as the user types after `/`). */
  filter: string
  onSelect: (cmd: SlashCommand) => void
  onClose: () => void
}

/** Claude-Code-style `/` command palette, anchored above the chat input. */
export default function CommandPalette({ filter, onSelect, onClose }: Props) {
  const results = filter ? matchCommands(filter) : COMMANDS
  const [active, setActive] = useState(0)

  useEffect(() => { setActive(0) }, [filter])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
      else if (e.key === 'Enter' && results[active]) { e.preventDefault(); onSelect(results[active]) }
      else if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'Tab' && results[active]) { e.preventDefault(); onSelect(results[active]) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [results, active, onSelect, onClose])

  if (results.length === 0) return null

  return (
    <div className="cmd-palette">
      <div className="cmd-palette-head">Commands</div>
      {results.map((c, i) => (
        <button
          key={c.cmd}
          className={`cmd-item${i === active ? ' active' : ''}`}
          onMouseEnter={() => setActive(i)}
          onClick={() => onSelect(c)}
        >
          <span className="cmd-name">{c.cmd}</span>
          <span className="cmd-label">{c.label}</span>
          <span className="cmd-desc">{c.desc}</span>
        </button>
      ))}
    </div>
  )
}
