import type { ResearchConstraints, ResearchMode } from '../types'

export type CommandAction = 'upload' | 'deep-search' | 'help' | 'export-paper' | 'export-pdf' | 'export-docx'

export interface SlashCommand {
  cmd: string
  label: string
  desc: string
  mode?: ResearchMode
  patch?: Partial<ResearchConstraints>
  action?: CommandAction
  queryPrefix?: string
}

/** The `/` command palette — Claude-Code-style. */
export const COMMANDS: SlashCommand[] = [
  { cmd: '/research', label: 'Deep Research',  desc: 'Comprehensive cited research',          mode: 'research' },
  { cmd: '/deep',     label: 'Web-wide Deep Search', desc: 'SearXNG + follow links everywhere', mode: 'research', patch: { use_deep_crawl: true } },
  { cmd: '/explain',  label: 'Learn Concept',  desc: 'Explain from basics to advanced',        mode: 'explain' },
  { cmd: '/validate', label: 'Validate Idea',  desc: 'Check novelty & prior art',              mode: 'validate' },
  { cmd: '/discover', label: 'Find Tools',     desc: 'Best tools/frameworks for a use case',   mode: 'discover' },
  { cmd: '/diagram',  label: 'With Diagrams',  desc: 'Emphasize Mermaid diagrams in output',   mode: 'explain', queryPrefix: 'Explain with clear diagrams: ' },
  { cmd: '/consensus',label: 'Consensus Mode', desc: 'Draft on two models, merge best',        patch: { use_consensus: true } },
  { cmd: '/paper',    label: 'Export Paper',   desc: 'Download report as a research paper PDF', action: 'export-paper' },
  { cmd: '/export',   label: 'Export PDF',     desc: 'Download report as PDF',                  action: 'export-pdf' },
  { cmd: '/upload',   label: 'Attach File',    desc: 'Image, audio, CSV, PDF, …',              action: 'upload' },
  { cmd: '/help',     label: 'Help',           desc: 'List available commands',                action: 'help' },
]

export function matchCommands(text: string): SlashCommand[] {
  const q = text.replace(/^\//, '').toLowerCase()
  return COMMANDS.filter(c => c.cmd.slice(1).startsWith(q))
}

/** Strip a leading recognized `/command` from a submitted query, returning the effect. */
export function parseLeadingCommand(input: string): {
  query: string
  mode?: ResearchMode
  patch?: Partial<ResearchConstraints>
  action?: CommandAction
} {
  const m = input.match(/^\/(\S+)\s*([\s\S]*)$/)
  if (!m) return { query: input }
  const found = COMMANDS.find(c => c.cmd === `/${m[1].toLowerCase()}`)
  if (!found) return { query: input }
  const rest = m[2].trim()
  return {
    query: (found.queryPrefix ?? '') + rest,
    mode: found.mode,
    patch: found.patch,
    action: found.action,
  }
}
