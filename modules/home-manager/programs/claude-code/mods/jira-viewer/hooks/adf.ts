export type AdfNode = {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  content?: AdfNode[]
}

function inline(nodes: AdfNode[] | undefined): string {
  return (nodes ?? []).map(inlineOf).join('')
}

function inlineOf(n: AdfNode): string {
  switch (n.type) {
    case 'text': {
      const raw = n.text ?? ''
      if (!raw.trim() || !n.marks?.length) return raw
      const lead = /^\s*/.exec(raw)?.[0] ?? ''
      const trail = /\s*$/.exec(raw)?.[0] ?? ''
      let t = raw.trim()
      for (const m of n.marks ?? []) {
        if (m.type === 'code') t = `\`${t}\``
        else if (m.type === 'strong') t = `**${t}**`
        else if (m.type === 'em') t = `*${t}*`
        else if (m.type === 'strike') t = `~~${t}~~`
        else if (m.type === 'link') t = `[${t}](${String(m.attrs?.href ?? '')})`
      }
      return `${lead}${t}${trail}`
    }
    case 'hardBreak':
      return '  \n'
    case 'mention':
      return `@${String(n.attrs?.text ?? '').replace(/^@/, '')}`
    case 'emoji':
      return String(n.attrs?.text ?? n.attrs?.shortName ?? '')
    case 'inlineCard':
    case 'blockCard':
      return String(n.attrs?.url ?? '')
    case 'status':
      return `\`${String(n.attrs?.text ?? '')}\``
    case 'date':
      return new Date(Number(n.attrs?.timestamp ?? 0)).toISOString().slice(0, 10)
    default:
      return inline(n.content)
  }
}

function block(n: AdfNode, indent = ''): string {
  switch (n.type) {
    case 'doc':
      return blocks(n.content)
    case 'paragraph':
      return indent + inline(n.content)
    case 'heading':
      return `${'#'.repeat(Number(n.attrs?.level ?? 2))} ${inline(n.content)}`
    case 'bulletList':
    case 'orderedList':
      return (n.content ?? [])
        .map((item, i) => {
          const mark = n.type === 'bulletList' ? '- ' : `${i + 1}. `
          const [first, ...rest] = (item.content ?? []).map(c => block(c, `${indent}   `).replace(/^\s+/, ''))
          return [`${indent}${mark}${first ?? ''}`, ...rest.map(r => `${indent}   ${r}`)].join('\n')
        })
        .join('\n')
    case 'taskList':
      return (n.content ?? [])
        .map(item => `${indent}- [${item.attrs?.state === 'DONE' ? 'x' : ' '}] ${inline(item.content)}`)
        .join('\n')
    case 'codeBlock':
      return `\`\`\`${String(n.attrs?.language ?? '')}\n${inline(n.content)}\n\`\`\``
    case 'blockquote':
      return blocks(n.content)
        .split('\n')
        .map(l => `> ${l}`)
        .join('\n')
    case 'panel':
      return blocks(n.content)
        .split('\n')
        .map(l => `> ${l}`)
        .join('\n')
    case 'rule':
      return '---'
    case 'table': {
      const rows = (n.content ?? []).map(r => (r.content ?? []).map(c => blocks(c.content).replace(/\n+/g, ' ').replace(/\|/g, '\\|')))
      if (rows.length === 0) return ''
      const width = Math.max(...rows.map(r => r.length))
      const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`
      return [line(rows[0]!), `|${' --- |'.repeat(width)}`, ...rows.slice(1).map(line)].join('\n')
    }
    case 'mediaSingle':
    case 'mediaGroup':
    case 'media':
      return '*[attachment]*'
    case 'expand':
    case 'nestedExpand':
      return `**${String(n.attrs?.title ?? 'Details')}**\n\n${blocks(n.content)}`
    default:
      return n.content ? blocks(n.content) : inlineOf(n)
  }
}

function blocks(nodes: AdfNode[] | undefined): string {
  return (nodes ?? [])
    .map(n => block(n))
    .filter(s => s.trim() !== '')
    .join('\n\n')
}

export function adfToMarkdown(doc: unknown): string {
  if (!doc) return ''
  if (typeof doc === 'string') return doc
  return block(doc as AdfNode).trim()
}

export function markdownToAdf(text: string): AdfNode & { version: 1 } {
  const paragraphs = text.trim().split(/\n{2,}/)
  return {
    version: 1,
    type: 'doc',
    content: paragraphs.map(p => {
      const lines = p.split('\n')
      const content: AdfNode[] = []
      lines.forEach((line, i) => {
        if (i > 0) content.push({ type: 'hardBreak' })
        if (line) content.push({ type: 'text', text: line })
      })
      return { type: 'paragraph', content }
    }),
  }
}
