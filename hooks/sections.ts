export type Section = { heading: string; level: number; lines: string[] }

export const PLAN_FILE = /\/\.claude\/plans\/[^/]+\.md$/

export function toSections(text: string): Section[] {
  const sections: Section[] = [{ heading: '', level: 0, lines: [] }]
  for (const line of text.split('\n')) {
    const m = /^(#{1,4})\s+(.*)$/.exec(line)
    if (m) sections.push({ heading: m[2], level: m[1].length, lines: [] })
    else sections[sections.length - 1].lines.push(line)
  }
  return sections.filter(s => s.heading || s.lines.some(l => l.trim()))
}

export function quote(s: Section): string {
  const body = s.lines.map(l => l.trim()).filter(Boolean).slice(0, 2).join(' ')
  const head = s.heading || body.slice(0, 80)
  return `> ${head}\n`
}
