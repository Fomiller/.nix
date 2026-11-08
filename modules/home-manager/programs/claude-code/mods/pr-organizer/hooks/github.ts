import type { Pr, TimelineItem } from '../types'

const PR_FIELDS = `
  nodes { ... on PullRequest {
    url number title state isDraft updatedAt headRefName baseRefName
    reviewDecision mergeable
    author { login }
    repository { nameWithOwner }
    labels(first: 10) { nodes { name } }
    reviewRequests(first: 10) { nodes { requestedReviewer {
      ... on User { login } ... on Team { name } ... on Bot { login } } } }
    commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    comments(last: 1) { totalCount nodes { author { login } createdAt } }
    reviews(last: 1) { totalCount nodes { author { login } submittedAt } }
  } }`

export const LIST_QUERY = `query($mine: String!, $merged: String!, $review: String!) {
  viewer { login }
  mine: search(query: $mine, type: ISSUE, first: 60) { ${PR_FIELDS} }
  merged: search(query: $merged, type: ISSUE, first: 25) { ${PR_FIELDS} }
  review: search(query: $review, type: ISSUE, first: 40) { ${PR_FIELDS} }
}`

export const SEARCH_QUERY = `query($q: String!) {
  viewer { login }
  results: search(query: $q, type: ISSUE, first: 50) { ${PR_FIELDS} }
}`

export const DETAIL_QUERY = `query($url: URI!) {
  resource(url: $url) { ... on PullRequest {
    body createdAt author { login }
    comments(last: 50) { nodes { author { login } body createdAt } }
    reviews(last: 30) { nodes { author { login } state body submittedAt } }
    reviewThreads(last: 50) { nodes {
      isResolved path line
      comments(first: 20) { nodes { author { login } body createdAt diffHunk } }
    } }
  } }
}`

type Login = { login: string } | null

export type Node = {
  url: string
  number: number
  title: string
  state: Pr['state']
  isDraft: boolean
  updatedAt: string
  headRefName: string
  baseRefName: string
  reviewDecision: string | null
  mergeable: string
  author: Login
  repository: { nameWithOwner: string }
  labels: { nodes: { name: string }[] }
  reviewRequests: { nodes: { requestedReviewer: { login?: string; name?: string } | null }[] }
  commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] }
  comments?: { totalCount: number; nodes: { author: Login; createdAt: string }[] }
  reviews?: { totalCount: number; nodes: { author: Login; submittedAt: string | null }[] }
}

export type ListData = {
  viewer: { login: string }
  mine: { nodes: Node[] }
  merged: { nodes: Node[] }
  review: { nodes: Node[] }
}

function lastActor(n: Node): string | null {
  const c = n.comments?.nodes[0]
  const r = n.reviews?.nodes[0]
  const cAt = c?.createdAt ?? ''
  const rAt = r?.submittedAt ?? ''
  if (!c && !r) return null
  return (cAt >= rAt ? c?.author?.login : r?.author?.login) ?? null
}

export function toPr(n: Node, isMine: boolean, isReviewRequested: boolean): Pr {
  return {
    url: n.url,
    number: n.number,
    title: n.title,
    repo: n.repository.nameWithOwner,
    author: n.author?.login ?? 'ghost',
    state: n.state,
    isDraft: n.isDraft,
    review: n.reviewDecision,
    ci: n.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null,
    mergeable: n.mergeable,
    headRef: n.headRefName,
    baseRef: n.baseRefName,
    updatedAt: n.updatedAt,
    labels: n.labels.nodes.map(l => l.name),
    reviewers: n.reviewRequests.nodes
      .map(r => r.requestedReviewer?.login ?? r.requestedReviewer?.name ?? '')
      .filter(Boolean),
    isMine,
    isReviewRequested,
    activity: (n.comments?.totalCount ?? 0) + (n.reviews?.totalCount ?? 0),
    lastActor: lastActor(n),
  }
}

export function searchResultsOf(data: { viewer: { login: string }; results: { nodes: Node[] } }): Pr[] {
  const me = data.viewer.login
  return data.results.nodes
    .filter(n => n?.url)
    .map(n => {
      const pr = toPr(n, n.author?.login === me, false)
      return { ...pr, isReviewRequested: pr.reviewers.includes(me) }
    })
}

export function searchQueryOf(text: string, scope: string): string {
  const parts = [text.trim()]
  if (!/(^|\s)is:(pr|pull-request)\b/.test(text)) parts.unshift('is:pr')
  if (!/(^|\s)archived:/.test(text)) parts.push('archived:false')
  if (!/(^|\s)sort:/.test(text)) parts.push('sort:updated-desc')
  if (scope.trim()) parts.push(scope.trim())
  return parts.filter(Boolean).join(' ')
}

export function mergeLists(data: ListData): Pr[] {
  const byUrl = new Map<string, Pr>()
  for (const n of [...data.mine.nodes, ...data.merged.nodes]) {
    if (n?.url) byUrl.set(n.url, toPr(n, true, false))
  }
  for (const n of data.review.nodes) {
    if (!n?.url) continue
    const had = byUrl.get(n.url)
    byUrl.set(n.url, had ? { ...had, isReviewRequested: true } : toPr(n, false, true))
  }
  return [...byUrl.values()]
}

type DetailNode = {
  body: string
  createdAt: string
  author: Login
  comments: { nodes: { author: Login; body: string; createdAt: string }[] }
  reviews: { nodes: { author: Login; state: string; body: string; submittedAt: string | null }[] }
  reviewThreads: {
    nodes: {
      isResolved: boolean
      path: string
      line: number | null
      comments: { nodes: { author: Login; body: string; createdAt: string; diffHunk?: string }[] }
    }[]
  }
}

export function toTimeline(d: DetailNode): TimelineItem[] {
  const who = (a: Login) => a?.login ?? 'ghost'
  const items: TimelineItem[] = []
  for (const c of d.comments.nodes) {
    items.push({ kind: 'comment', author: who(c.author), at: c.createdAt, body: c.body })
  }
  for (const r of d.reviews.nodes) {
    if (r.state === 'COMMENTED' && !r.body.trim()) continue
    items.push({
      kind: 'review',
      author: who(r.author),
      at: r.submittedAt ?? '',
      body: r.body,
      state: r.state,
    })
  }
  for (const t of d.reviewThreads.nodes) {
    const [first, ...rest] = t.comments.nodes
    if (!first) continue
    items.push({
      kind: 'thread',
      author: who(first.author),
      at: first.createdAt,
      body: first.body,
      path: t.path,
      line: t.line,
      isResolved: t.isResolved,
      diff: first.diffHunk ? trimHunk(first.diffHunk, 8) : undefined,
      replies: rest.map(c => ({ author: who(c.author), at: c.createdAt, body: c.body })),
    })
  }
  items.sort((a, b) => b.at.localeCompare(a.at))
  if (d.body.trim()) {
    items.push({ kind: 'description', author: who(d.author), at: d.createdAt, body: d.body })
  }
  return items
}

export function trimHunk(hunk: string, keep: number): string {
  const [header, ...lines] = hunk.replace(/\n$/, '').split('\n')
  const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(header ?? '')
  if (!m || lines.length <= keep) return hunk
  const dropped = lines.slice(0, lines.length - keep)
  const kept = lines.slice(lines.length - keep)
  const counts = (ls: string[]) => ({
    old: ls.filter(l => !l.startsWith('+')).length,
    new: ls.filter(l => !l.startsWith('-')).length,
  })
  const skip = counts(dropped)
  const size = counts(kept)
  const oldStart = Number(m[1]) + skip.old
  const newStart = Number(m[2]) + skip.new
  return [`@@ -${oldStart},${size.old} +${newStart},${size.new} @@${m[3] ?? ''}`, ...kept].join('\n')
}

export function firstLine(text: string): string {
  return text.trim().split('\n')[0]?.slice(0, 300) ?? ''
}
