import type { EngineInterface } from 'claude-code'

import type { Meta, StatusType, Ticket, TicketDetail, Transition } from './core'

const API = 'https://api.linear.app/graphql'

const FIELDS = `
  id identifier title url priority priorityLabel estimate branchName updatedAt
  state { id name type }
  team { key name }
  project { name }
  cycle { number name }
  parent { identifier title }
  labels { nodes { name } }
  assignee { id displayName }
  creator { id }
  comments(last: 1) { nodes { createdAt user { id displayName } } }`

const LIST = `query($since: DateTimeOrDuration!) {
  viewer {
    id
    assignedIssues(first: 100, orderBy: updatedAt, filter: { or: [
      { state: { type: { nin: ["completed", "canceled"] } } },
      { completedAt: { gt: $since } }
    ] }) { nodes { ${FIELDS} } }
    createdIssues(first: 50, orderBy: updatedAt, filter: { state: { type: { nin: ["completed", "canceled"] } } }) { nodes { ${FIELDS} } }
  }
}`

const SEARCH = `query($filter: IssueFilter!) {
  viewer { id }
  issues(first: 50, orderBy: updatedAt, filter: $filter) { nodes { ${FIELDS} } }
}`

const DETAIL = `query($id: String!) {
  issue(id: $id) {
    description
    comments(first: 100) { nodes { body createdAt user { displayName } } }
  }
}`

const STATES = `query($id: String!) {
  issue(id: $id) { team { states { nodes { id name type position } } } }
}`

type Node = {
  id: string
  identifier: string
  title: string
  url: string
  priority: number
  priorityLabel: string
  estimate: number | null
  branchName: string | null
  updatedAt: string
  state: { id: string; name: string; type: string }
  team: { key: string; name: string } | null
  project: { name: string } | null
  cycle: { number: number; name: string | null } | null
  parent: { identifier: string; title: string } | null
  labels: { nodes: { name: string }[] }
  assignee: { id: string; displayName: string } | null
  creator: { id: string } | null
  comments: { nodes: { createdAt: string; user: { id: string; displayName: string } | null }[] }
}

let meCache: { id: string; name: string } | null = null

async function apiKey($: EngineInterface) {
  return (await $.env.get('LINEAR_API_KEY'))?.trim() || null
}

async function gql<T>($: EngineInterface, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const key = await apiKey($)
  if (!key) throw new Error('LINEAR_API_KEY is not set')
  const res = await $.http.fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: key },
    body: JSON.stringify({ query, variables }),
  })
  const json = JSON.parse(res.text || '{}') as { data?: T; errors?: { message: string }[] }
  if (!res.ok || json.errors?.length) {
    throw new Error(json.errors?.[0]?.message ?? `HTTP ${res.status}`)
  }
  return json.data as T
}

async function viewer($: EngineInterface) {
  if (!meCache) {
    const d = await gql<{ viewer: { id: string; displayName: string } }>($, 'query { viewer { id displayName } }')
    meCache = { id: d.viewer.id, name: d.viewer.displayName }
  }
  return meCache
}

function statusTypeOf(type: string, name: string): StatusType {
  if (type === 'completed') return 'done'
  if (type === 'canceled') return 'canceled'
  if (type === 'started') return /review/i.test(name) ? 'review' : 'started'
  if (type === 'triage' || type === 'backlog' || type === 'unstarted') return type
  return 'unstarted'
}

function toTicket(n: Node, me: string): Ticket {
  const last = n.comments.nodes[n.comments.nodes.length - 1]
  return {
    id: n.id,
    key: n.identifier,
    title: n.title,
    url: n.url,
    status: n.state.name,
    statusType: statusTypeOf(n.state.type, n.state.name),
    priority: n.priority,
    priorityLabel: n.priorityLabel,
    assignee: n.assignee?.displayName ?? null,
    isAssignedToMe: n.assignee?.id === me,
    isCreatedByMe: n.creator?.id === me,
    project: n.project?.name ?? null,
    team: n.team?.key ?? null,
    sprint: n.cycle ? (n.cycle.name ?? `Cycle ${n.cycle.number}`) : null,
    parent: n.parent ? `${n.parent.identifier} ${n.parent.title}` : null,
    labels: n.labels.nodes.map(l => l.name),
    estimate: n.estimate,
    branch: n.branchName,
    updatedAt: n.updatedAt,
    lastCommentAt: last?.createdAt ?? null,
    lastCommenter: last?.user?.displayName ?? null,
  }
}

const QUALIFIER = /(^|\s)-?(assignee|creator|team|project|label|status|state|is|priority|cycle):\S/i

export function filterOf(text: string): Record<string, unknown> {
  const and: Record<string, unknown>[] = []
  const words: string[] = []
  for (const token of text.match(/(\S+:"[^"]*"|\S+)/g) ?? []) {
    const m = /^(-?)([a-z]+):"?([^"]*)"?$/i.exec(token)
    if (!m) {
      words.push(token)
      continue
    }
    const [, neg, rawKey, value] = m
    const key = rawKey!.toLowerCase()
    const v = value ?? ''
    let clause: Record<string, unknown> | null = null
    if (key === 'assignee') {
      clause = v === 'me' ? { assignee: { isMe: { eq: true } } } : v === 'none' ? { assignee: { null: true } } : { assignee: { displayName: { containsIgnoreCase: v } } }
    } else if (key === 'creator') {
      clause = v === 'me' ? { creator: { isMe: { eq: true } } } : { creator: { displayName: { containsIgnoreCase: v } } }
    } else if (key === 'team') {
      clause = { team: { key: { eqIgnoreCase: v } } }
    } else if (key === 'project') {
      clause = { project: { name: { containsIgnoreCase: v } } }
    } else if (key === 'label') {
      clause = { labels: { name: { eqIgnoreCase: v } } }
    } else if (key === 'status' || key === 'state') {
      clause = { state: { name: { eqIgnoreCase: v } } }
    } else if (key === 'is') {
      clause =
        v === 'open'
          ? { state: { type: { nin: ['completed', 'canceled'] } } }
          : v === 'done'
            ? { state: { type: { eq: 'completed' } } }
            : { state: { type: { eq: v } } }
    } else if (key === 'priority') {
      const p = { urgent: 1, high: 2, medium: 3, low: 4, none: 0 }[v.toLowerCase()] ?? Number(v)
      clause = { priority: { eq: p } }
    } else if (key === 'cycle') {
      clause = v === 'current' ? { cycle: { isActive: { eq: true } } } : { cycle: { number: { eq: Number(v) } } }
    } else {
      words.push(token)
    }
    if (clause) and.push(neg ? { not: clause } : clause)
  }
  if (words.length) {
    const term = words.join(' ')
    and.push({ or: [{ title: { containsIgnoreCase: term } }, { description: { containsIgnoreCase: term } }] })
  }
  return and.length === 1 ? and[0]! : { and }
}

export const meta: Meta = {
  name: 'Linear',
  command: 'linear',
  pane: 'linear-viewer',
  setupHelp: [
    'Create a personal API key in Linear under **Settings → Security & access → Personal API keys**.',
    'Then export it before starting Claude Code, for example in `~/.config/zsh/secrets.zsh`:',
    '```sh\nexport LINEAR_API_KEY=lin_api_...\n```',
    'Restart Claude Code and press `r`.',
  ].join('\n\n'),
  searchHelp:
    'Qualifiers like assignee:pat, assignee:me, creator:me, team:FOM, project:blog, label:bug, status:"In Review", is:open, is:done, priority:high or cycle:current search Linear. Other words match the title and description.',
  searchPlaceholder: 'assignee:pat is:open',
}

export function isRemoteQuery(text: string): boolean {
  return QUALIFIER.test(text)
}

export async function check($: EngineInterface): Promise<string | null> {
  return (await apiKey($)) ? null : 'LINEAR_API_KEY is not set.'
}

export async function me($: EngineInterface): Promise<string> {
  return (await viewer($)).name
}

export async function list($: EngineInterface): Promise<Ticket[]> {
  const d = await gql<{ viewer: { id: string; assignedIssues: { nodes: Node[] }; createdIssues: { nodes: Node[] } } }>($, LIST, { since: '-P14D' })
  const byKey = new Map<string, Ticket>()
  for (const n of [...d.viewer.assignedIssues.nodes, ...d.viewer.createdIssues.nodes]) byKey.set(n.identifier, toTicket(n, d.viewer.id))
  return [...byKey.values()]
}

export async function search($: EngineInterface, query: string): Promise<Ticket[]> {
  const d = await gql<{ viewer: { id: string }; issues: { nodes: Node[] } }>($, SEARCH, { filter: filterOf(query) })
  return d.issues.nodes.map(n => toTicket(n, d.viewer.id))
}

export async function detail($: EngineInterface, t: Ticket): Promise<TicketDetail> {
  const d = await gql<{ issue: { description: string | null; comments: { nodes: { body: string; createdAt: string; user: { displayName: string } | null }[] } } }>($, DETAIL, { id: t.id })
  return {
    description: d.issue.description ?? '',
    comments: d.issue.comments.nodes.map(c => ({ author: c.user?.displayName ?? 'Linear', at: c.createdAt, body: c.body })),
  }
}

export async function transitions($: EngineInterface, t: Ticket): Promise<Transition[]> {
  const d = await gql<{ issue: { team: { states: { nodes: { id: string; name: string; type: string; position: number }[] } } } }>($, STATES, { id: t.id })
  return [...d.issue.team.states.nodes]
    .sort((a, b) => a.position - b.position)
    .map(s => ({ id: s.id, name: s.name, type: statusTypeOf(s.type, s.name) }))
}

export async function transition($: EngineInterface, t: Ticket, to: Transition): Promise<void> {
  await gql($, 'mutation($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success } }', { id: t.id, stateId: to.id })
}

export async function comment($: EngineInterface, t: Ticket, body: string): Promise<void> {
  await gql($, 'mutation($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success } }', { issueId: t.id, body })
}

export async function assignToMe($: EngineInterface, t: Ticket): Promise<void> {
  const self = await viewer($)
  await gql($, 'mutation($id: String!, $a: String!) { issueUpdate(id: $id, input: { assigneeId: $a }) { success } }', { id: t.id, a: self.id })
}
