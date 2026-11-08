import type { EventKind, GroupBy, Pr, Snapshot, View } from '../types'

export const UNGROUPED = 'Ungrouped'

export const VIEWS: { value: View; label: string; test: (p: Pr) => boolean }[] = [
  { value: 'open', label: 'Open', test: p => p.isMine && p.state === 'OPEN' },
  { value: 'draft', label: 'Draft', test: p => p.isMine && p.state === 'OPEN' && p.isDraft },
  {
    value: 'needs-review',
    label: 'Awaiting',
    test: p =>
      p.isMine &&
      p.state === 'OPEN' &&
      !p.isDraft &&
      (p.review === 'REVIEW_REQUIRED' || p.review === null),
  },
  {
    value: 'approved',
    label: 'Approved',
    test: p => p.isMine && p.state === 'OPEN' && p.review === 'APPROVED',
  },
  {
    value: 'changes',
    label: 'Changes',
    test: p => p.isMine && p.state === 'OPEN' && p.review === 'CHANGES_REQUESTED',
  },
  {
    value: 'failing',
    label: 'CI failing',
    test: p => p.isMine && p.state === 'OPEN' && (p.ci === 'FAILURE' || p.ci === 'ERROR'),
  },
  {
    value: 'to-review',
    label: 'To review',
    test: p => p.isReviewRequested && p.state === 'OPEN',
  },
  { value: 'merged', label: 'Merged', test: p => p.isMine && p.state === 'MERGED' },
]

const TICKET = /(?:^|[^A-Za-z0-9])([A-Za-z][A-Za-z0-9]{1,9}-\d+)(?![A-Za-z0-9])/

export function ticketOf(pr: Pr): string | null {
  const m = TICKET.exec(pr.title) ?? TICKET.exec(pr.headRef)
  return m?.[1] ? m[1].toUpperCase() : null
}

export function groupOf(pr: Pr, by: GroupBy, groups: Record<string, string>): string {
  if (by === 'none') return 'All'
  if (by === 'repo') return pr.repo
  return groups[pr.url] ?? ticketOf(pr) ?? UNGROUPED
}

export function grouped(list: Pr[], by: GroupBy, groups: Record<string, string>) {
  const map = new Map<string, Pr[]>()
  for (const pr of list) {
    const g = groupOf(pr, by, groups)
    map.set(g, [...(map.get(g) ?? []), pr])
  }
  return [...map.entries()]
    .map(([name, prs]) => ({
      name,
      prs: prs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }))
    .sort((a, b) =>
      a.name === UNGROUPED ? 1 : b.name === UNGROUPED ? -1 : a.name.localeCompare(b.name),
    )
}

export type Row = { kind: 'group'; name: string; count: number } | { kind: 'pr'; pr: Pr }

export function rowsOf(
  list: Pr[],
  by: GroupBy,
  groups: Record<string, string>,
  collapsed: string[],
): Row[] {
  const rows: Row[] = []
  for (const section of grouped(list, by, groups)) {
    if (by !== 'none') rows.push({ kind: 'group', name: section.name, count: section.prs.length })
    if (by !== 'none' && collapsed.includes(section.name)) continue
    for (const pr of section.prs) rows.push({ kind: 'pr', pr })
  }
  return rows
}

export function rowId(row: Row): string {
  return row.kind === 'pr' ? row.pr.url : `grp:${row.name}`
}

export function shortRef(pr: Pr): string {
  return `${pr.repo.split('/')[1] ?? pr.repo}#${pr.number}`
}

export function snapshotOf(prs: Pr[]): Snapshot {
  const snap: Snapshot = {}
  for (const p of prs) {
    snap[p.url] = {
      review: p.review,
      ci: p.ci,
      state: p.state,
      activity: p.activity,
      isReviewRequested: p.isReviewRequested,
    }
  }
  return snap
}

export function changesOf(
  before: Snapshot,
  prs: Pr[],
  me: string,
): { url: string; kind: EventKind; text: string }[] {
  const out: { url: string; kind: EventKind; text: string }[] = []
  for (const p of prs) {
    const was = before[p.url]
    const ref = `${shortRef(p)} ${p.title}`
    if (!was) {
      if (p.isReviewRequested && !p.isMine && p.state === 'OPEN') {
        out.push({ url: p.url, kind: 'review-requested', text: `Review requested: ${ref}` })
      }
      continue
    }
    if (p.isMine) {
      if (p.state === 'MERGED' && was.state !== 'MERGED') {
        out.push({ url: p.url, kind: 'merged', text: `Merged: ${ref}` })
        continue
      }
      if (p.state !== 'OPEN') continue
      if (p.review === 'APPROVED' && was.review !== 'APPROVED') {
        const ready = p.ci === 'SUCCESS' && p.mergeable !== 'CONFLICTING'
        out.push({
          url: p.url,
          kind: 'approved',
          text: `Approved${ready ? ', ready to merge' : ''}: ${ref}`,
        })
      }
      if (p.review === 'CHANGES_REQUESTED' && was.review !== 'CHANGES_REQUESTED') {
        out.push({ url: p.url, kind: 'changes', text: `Changes requested: ${ref}` })
      }
      const failed = (s: string | null) => s === 'FAILURE' || s === 'ERROR'
      if (failed(p.ci) && !failed(was.ci)) {
        out.push({ url: p.url, kind: 'ci-failed', text: `CI failed: ${ref}` })
      }
      if (p.ci === 'SUCCESS' && was.ci !== null && was.ci !== 'SUCCESS') {
        out.push({ url: p.url, kind: 'ci-passed', text: `CI passed: ${ref}` })
      }
    } else if (p.isReviewRequested && !was.isReviewRequested && p.state === 'OPEN') {
      out.push({ url: p.url, kind: 'review-requested', text: `Review requested: ${ref}` })
    }
    if (p.state === 'OPEN' && p.activity > was.activity && p.lastActor && p.lastActor !== me) {
      out.push({ url: p.url, kind: 'comment', text: `New comment from ${p.lastActor}: ${ref}` })
    }
  }
  return out
}

export function clip(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, Math.max(1, width - 1))}…`
}

export function ago(iso: string, now: number): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000)
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

export function badge(pr: Pr): { text: string; color: string } {
  if (pr.state === 'MERGED') return { text: 'merged', color: 'merged' }
  if (pr.state === 'CLOSED') return { text: 'closed', color: 'inactive' }
  if (pr.isDraft) return { text: 'draft', color: 'inactive' }
  if (pr.review === 'APPROVED') return { text: 'approved', color: 'success' }
  if (pr.review === 'CHANGES_REQUESTED') return { text: 'changes', color: 'error' }
  return { text: 'review', color: 'warning' }
}

export function ciMark(pr: Pr): { text: string; color: string } {
  switch (pr.ci) {
    case 'SUCCESS':
      return { text: '✓', color: 'success' }
    case 'FAILURE':
    case 'ERROR':
      return { text: '✗', color: 'error' }
    case 'PENDING':
    case 'EXPECTED':
      return { text: '●', color: 'warning' }
    default:
      return { text: '·', color: 'inactive' }
  }
}
