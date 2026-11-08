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
let mcpMe: { id: string; name: string } | null = null
let mcpTools: string[] = []

export const readTools = ['list_issues', 'get_issue', 'list_comments', 'list_issue_statuses', 'whoami']

let background = false
const blocked = new Set<string>()

export function setBackground(on: boolean): void {
  background = on
}

export function blockedTools(): string[] {
  return [...blocked].sort()
}

async function mcpTool($: EngineInterface, suffix: string): Promise<string | null> {
  const hit = (names: string[]) =>
    names.find(n => n.startsWith('mcp__') && !n.startsWith('mcp__linear-viewer__') && n.toLowerCase().includes('linear') && n.endsWith(`__${suffix}`)) ?? null
  const cached = hit(mcpTools)
  if (cached) return cached
  mcpTools = (await $.tool.list()).map(t => t.name)
  return hit(mcpTools)
}

async function mcp<T>($: EngineInterface, suffix: string, args: Record<string, unknown>): Promise<T> {
  const tool = await mcpTool($, suffix)
  if (!tool) throw new Error(`no Linear connector tool ${suffix}`)
  if (background) {
    const verdict = await $.tool.check({ tool, input: args })
    if (verdict.decision !== 'allow') {
      blocked.add(tool)
      throw new Error(`background checks need permission for ${tool}`)
    }
    blocked.delete(tool)
  }
  const out = (await $.tool.call({ tool, ...args } as never)) as { deny?: string; text?: string; isError?: boolean }
  if (out.deny) throw new Error(out.deny)
  if (out.isError) throw new Error(firstLineOf(out.text ?? `${suffix} failed`))
  try {
    return JSON.parse(out.text ?? 'null') as T
  } catch {
    throw new Error(`${suffix} returned something other than JSON: ${firstLineOf(out.text ?? '')}`)
  }
}

function firstLineOf(text: string): string {
  return text.trim().split('\n')[0]?.slice(0, 200) ?? ''
}

export async function backend($: EngineInterface): Promise<'connector' | 'api key' | null> {
  if (await mcpTool($, 'list_issues')) return 'connector'
  if (await apiKey($)) return 'api key'
  return null
}

async function useMcp($: EngineInterface): Promise<boolean> {
  return (await backend($)) === 'connector'
}

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
    'The viewer uses your **Linear connector** when one is connected. Connect it with `/mcp`, or in claude.ai under Settings → Connectors.',
    'If you would rather use an API key, create one in Linear under **Settings → Security & access → Personal API keys**, then export it before starting Claude Code, for example in `~/.config/zsh/secrets.zsh`:',
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


async function keyMe($: EngineInterface): Promise<string> {
  return (await viewer($)).name
}

async function keyList($: EngineInterface): Promise<Ticket[]> {
  const d = await gql<{ viewer: { id: string; assignedIssues: { nodes: Node[] }; createdIssues: { nodes: Node[] } } }>($, LIST, { since: '-P14D' })
  const byKey = new Map<string, Ticket>()
  for (const n of [...d.viewer.assignedIssues.nodes, ...d.viewer.createdIssues.nodes]) byKey.set(n.identifier, toTicket(n, d.viewer.id))
  return [...byKey.values()]
}

async function keySearch($: EngineInterface, query: string): Promise<Ticket[]> {
  const d = await gql<{ viewer: { id: string }; issues: { nodes: Node[] } }>($, SEARCH, { filter: filterOf(query) })
  return d.issues.nodes.map(n => toTicket(n, d.viewer.id))
}

async function keyDetail($: EngineInterface, t: Ticket): Promise<TicketDetail> {
  const d = await gql<{ issue: { description: string | null; comments: { nodes: { body: string; createdAt: string; user: { displayName: string } | null }[] } } }>($, DETAIL, { id: t.id })
  return {
    description: d.issue.description ?? '',
    comments: d.issue.comments.nodes.map(c => ({ author: c.user?.displayName ?? 'Linear', at: c.createdAt, body: c.body })),
  }
}

async function keyTransitions($: EngineInterface, t: Ticket): Promise<Transition[]> {
  const d = await gql<{ issue: { team: { states: { nodes: { id: string; name: string; type: string; position: number }[] } } } }>($, STATES, { id: t.id })
  return [...d.issue.team.states.nodes]
    .sort((a, b) => a.position - b.position)
    .map(s => ({ id: s.id, name: s.name, type: statusTypeOf(s.type, s.name) }))
}

async function keyTransition($: EngineInterface, t: Ticket, to: Transition): Promise<void> {
  await gql($, 'mutation($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success } }', { id: t.id, stateId: to.id })
}

async function keyComment($: EngineInterface, t: Ticket, body: string): Promise<void> {
  await gql($, 'mutation($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success } }', { issueId: t.id, body })
}

async function keyAssignToMe($: EngineInterface, t: Ticket): Promise<void> {
  const self = await viewer($)
  await gql($, 'mutation($id: String!, $a: String!) { issueUpdate(id: $id, input: { assigneeId: $a }) { success } }', { id: t.id, a: self.id })
}

type McpIssue = {
  id: string
  uuid: string
  title: string
  url: string
  gitBranchName?: string | null
  priority?: { value: number; name: string } | number | null
  estimate?: number | null
  updatedAt: string
  completedAt?: string | null
  status: string
  statusType: string
  labels?: (string | { name: string })[]
  assignee?: string | null
  assigneeId?: string | null
  createdById?: string | null
  project?: string | null
  team?: string | null
  parentId?: string | null
}

const MCP_FIELDS = [
  'id', 'uuid', 'title', 'url', 'gitBranchName', 'priority', 'estimate', 'updatedAt', 'completedAt',
  'status', 'statusType', 'labels', 'assignee', 'assigneeId', 'createdById', 'project', 'team', 'parentId',
]

async function mcpViewer($: EngineInterface) {
  if (!mcpMe) {
    const d = await mcp<{ user: { id: string; name: string; displayName?: string } }>($, 'whoami', {})
    mcpMe = { id: d.user.id, name: d.user.name }
  }
  return mcpMe
}

function fromMcp(i: McpIssue, me: string): Ticket {
  const p = typeof i.priority === 'number' ? { value: i.priority, name: '' } : (i.priority ?? { value: 0, name: 'No priority' })
  return {
    id: i.uuid,
    key: i.id,
    title: i.title,
    url: i.url,
    status: i.status,
    statusType: statusTypeOf(i.statusType === 'duplicate' ? 'canceled' : i.statusType, i.status),
    priority: p.value,
    priorityLabel: p.name || ['No priority', 'Urgent', 'High', 'Medium', 'Low'][p.value] || 'No priority',
    assignee: i.assignee ?? null,
    isAssignedToMe: i.assigneeId === me,
    isCreatedByMe: i.createdById === me,
    project: i.project ?? null,
    team: i.team ?? null,
    sprint: null,
    parent: i.parentId && /^[A-Z][A-Z0-9]*-\d+$/.test(i.parentId) ? i.parentId : null,
    labels: (i.labels ?? []).map(l => (typeof l === 'string' ? l : l.name)),
    estimate: i.estimate ?? null,
    branch: i.gitBranchName ?? null,
    updatedAt: i.updatedAt,
    lastCommentAt: null,
    lastCommenter: null,
  }
}

async function mcpIssues($: EngineInterface, args: Record<string, unknown>): Promise<Ticket[]> {
  const me = await mcpViewer($)
  const d = await mcp<{ issues: McpIssue[] }>($, 'list_issues', { fields: MCP_FIELDS, orderBy: 'updatedAt', ...args })
  return (d.issues ?? []).map(i => fromMcp(i, me.id))
}

export function mcpArgsOf(text: string): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  const words: string[] = []
  for (const token of text.match(/(\S+:"[^"]*"|\S+)/g) ?? []) {
    const m = /^([a-z]+):"?([^"]*)"?$/i.exec(token)
    const key = m?.[1]?.toLowerCase()
    const v = m?.[2] ?? ''
    if (key === 'assignee') args.assignee = v === 'none' ? 'null' : v
    else if (key === 'creator') args.creator = v
    else if (key === 'team') args.team = v
    else if (key === 'project') args.project = v
    else if (key === 'label') args.label = v
    else if (key === 'status' || key === 'state') args.state = v
    else if (key === 'is') args.state = v === 'open' ? undefined : v === 'done' ? 'completed' : v
    else if (key === 'priority') args.priority = { urgent: 1, high: 2, medium: 3, low: 4, none: 0 }[v.toLowerCase()] ?? Number(v)
    else if (key === 'cycle') args.cycle = v
    else words.push(token)
  }
  if (words.length) args.query = words.join(' ')
  return Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined))
}

export async function check($: EngineInterface): Promise<string | null> {
  return (await backend($)) ? null : 'No Linear connector found and LINEAR_API_KEY is not set.'
}

export async function me($: EngineInterface): Promise<string> {
  return (await useMcp($)) ? (await mcpViewer($)).name : keyMe($)
}

export async function list($: EngineInterface): Promise<Ticket[]> {
  if (!(await useMcp($))) return keyList($)
  const since = Date.now() - 14 * 86_400_000
  const [mine, created] = await Promise.all([
    mcpIssues($, { assignee: 'me', limit: 150 }),
    mcpIssues($, { creator: 'me', limit: 50 }),
  ])
  const byKey = new Map<string, Ticket>()
  for (const t of [...mine, ...created]) {
    const isOpen = t.statusType !== 'done' && t.statusType !== 'canceled'
    if (isOpen || (t.isAssignedToMe && Date.parse(t.updatedAt) > since)) byKey.set(t.key, t)
  }
  return [...byKey.values()]
}

export async function search($: EngineInterface, query: string): Promise<Ticket[]> {
  if (!(await useMcp($))) return keySearch($, query)
  const found = await mcpIssues($, { limit: 50, ...mcpArgsOf(query) })
  return /(^|\s)is:open\b/.test(query) ? found.filter(t => t.statusType !== 'done' && t.statusType !== 'canceled') : found
}

type McpComment = {
  body: string
  createdAt: string
  author?: string | { name?: string; displayName?: string } | null
  user?: string | { name?: string; displayName?: string } | null
}

function nameOf(v: McpComment['author']): string | null {
  if (!v) return null
  return typeof v === 'string' ? v : (v.name ?? v.displayName ?? null)
}

export async function detail($: EngineInterface, t: Ticket): Promise<TicketDetail> {
  if (!(await useMcp($))) return keyDetail($, t)
  const [issue, comments] = await Promise.all([
    mcp<{ description?: string | null }>($, 'get_issue', { id: t.key }),
    mcp<{ comments: McpComment[] }>($, 'list_comments', { issueId: t.key, limit: 100, orderBy: 'createdAt' }),
  ])
  return {
    description: issue.description ?? '',
    comments: (comments.comments ?? []).map(c => ({ author: nameOf(c.author) ?? nameOf(c.user) ?? 'Linear', at: c.createdAt, body: c.body })),
  }
}

export async function transitions($: EngineInterface, t: Ticket): Promise<Transition[]> {
  if (!(await useMcp($))) return keyTransitions($, t)
  const order = ['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled', 'duplicate']
  const d = await mcp<{ id: string; name: string; type: string }[]>($, 'list_issue_statuses', { team: t.team ?? '' })
  return [...d]
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
    .map(st => ({ id: st.id, name: st.name, type: statusTypeOf(st.type === 'duplicate' ? 'canceled' : st.type, st.name) }))
}

export async function transition($: EngineInterface, t: Ticket, to: Transition): Promise<void> {
  if (!(await useMcp($))) return keyTransition($, t, to)
  await mcp($, 'save_issue', { id: t.key, state: to.id })
}

export async function comment($: EngineInterface, t: Ticket, body: string): Promise<void> {
  if (!(await useMcp($))) return keyComment($, t, body)
  await mcp($, 'save_comment', { issueId: t.key, body })
}

export async function assignToMe($: EngineInterface, t: Ticket): Promise<void> {
  if (!(await useMcp($))) return keyAssignToMe($, t)
  await mcp($, 'save_issue', { id: t.key, assignee: 'me' })
}
