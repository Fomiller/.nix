import type { EngineInterface } from 'claude-code'

import { adfToMarkdown, markdownToAdf } from './adf'
import type { Meta, StatusType, Ticket, TicketDetail, Transition } from './core'

const SPRINT_FIELD = 'customfield_10020'

const FIELDS = [
  'summary',
  'status',
  'priority',
  'assignee',
  'reporter',
  'project',
  'labels',
  'updated',
  'parent',
  'comment',
  'issuetype',
  SPRINT_FIELD,
]

const LIST_JQL =
  '(assignee = currentUser() AND (statusCategory != Done OR resolved >= -14d)) OR (reporter = currentUser() AND statusCategory != Done) ORDER BY updated DESC'

type Config = { base: string; auth: string }

type User = { accountId: string; displayName: string } | null

type Issue = {
  id: string
  key: string
  fields: {
    summary: string
    status: { id: string; name: string; statusCategory: { key: string } }
    priority: { name: string } | null
    assignee: User
    reporter: User
    project: { key: string; name: string } | null
    labels: string[]
    updated: string
    parent?: { key: string; fields?: { summary?: string } }
    comment?: { comments: { author: User; created: string; body: unknown }[]; total: number }
    issuetype?: { name: string }
    [SPRINT_FIELD]?: { name: string; state: string }[] | null
  }
}

let meCache: { accountId: string; displayName: string } | null = null

async function config($: EngineInterface): Promise<Config | null> {
  const base = (await $.env.get('JIRA_BASE_URL'))?.trim().replace(/\/+$/, '')
  const email = (await $.env.get('JIRA_EMAIL'))?.trim()
  const token = (await $.env.get('JIRA_API_TOKEN'))?.trim()
  if (!base || !email || !token) return null
  return { base, auth: `Basic ${btoa(`${email}:${token}`)}` }
}

async function api<T>($: EngineInterface, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const c = await config($)
  if (!c) throw new Error('Jira is not configured')
  const res = await $.http.fetch(`${c.base}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: c.auth,
      accept: 'application/json',
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const j = JSON.parse(res.text) as { errorMessages?: string[]; errors?: Record<string, string> }
      msg = j.errorMessages?.[0] ?? Object.values(j.errors ?? {})[0] ?? msg
    } catch {}
    throw new Error(msg)
  }
  return (res.text ? JSON.parse(res.text) : undefined) as T
}

async function myself($: EngineInterface) {
  if (!meCache) meCache = await api<{ accountId: string; displayName: string }>($, '/rest/api/3/myself')
  return meCache
}

function statusTypeOf(category: string, name: string): StatusType {
  if (category === 'done') return /cancel|won.?t|reject|declin|duplicate/i.test(name) ? 'canceled' : 'done'
  if (category === 'indeterminate') return /review|qa|testing|verify/i.test(name) ? 'review' : 'started'
  if (/triage/i.test(name)) return 'triage'
  if (/backlog/i.test(name)) return 'backlog'
  return 'unstarted'
}

function priorityOf(name: string | undefined): number {
  switch ((name ?? '').toLowerCase()) {
    case 'highest':
    case 'blocker':
    case 'critical':
      return 1
    case 'high':
    case 'major':
      return 2
    case 'medium':
      return 3
    case 'low':
    case 'lowest':
    case 'minor':
    case 'trivial':
      return 4
    default:
      return 0
  }
}

function toTicket(i: Issue, base: string, me: string): Ticket {
  const f = i.fields
  const comments = f.comment?.comments ?? []
  const last = comments[comments.length - 1]
  const sprints = f[SPRINT_FIELD] ?? []
  const sprint = sprints.find(s => s.state === 'active') ?? sprints[sprints.length - 1]
  return {
    id: i.id,
    key: i.key,
    title: f.summary,
    url: `${base}/browse/${i.key}`,
    status: f.status.name,
    statusType: statusTypeOf(f.status.statusCategory.key, f.status.name),
    priority: priorityOf(f.priority?.name),
    priorityLabel: f.priority?.name ?? 'None',
    assignee: f.assignee?.displayName ?? null,
    isAssignedToMe: f.assignee?.accountId === me,
    isCreatedByMe: f.reporter?.accountId === me,
    project: f.project?.name ?? null,
    team: f.project?.key ?? null,
    sprint: sprint?.name ?? null,
    parent: f.parent ? `${f.parent.key} ${f.parent.fields?.summary ?? ''}`.trim() : null,
    labels: f.labels ?? [],
    estimate: null,
    branch: null,
    updatedAt: f.updated,
    lastCommentAt: last?.created ?? null,
    lastCommenter: last?.author?.displayName ?? null,
  }
}

async function searchJql($: EngineInterface, jql: string, max: number): Promise<Ticket[]> {
  const c = await config($)
  if (!c) throw new Error('Jira is not configured')
  const me = await myself($)
  const d = await api<{ issues: Issue[] }>($, '/rest/api/3/search/jql', {
    method: 'POST',
    body: { jql, maxResults: max, fields: FIELDS },
  })
  return d.issues.map(i => toTicket(i, c.base, me.accountId))
}

const JQL_LIKE = /(\s(=|!=|~|in|not in|is|>=|<=)\s)|\border by\b|currentUser\(\)/i
const QUALIFIER = /(^|\s)-?(assignee|reporter|project|status|label|type|sprint|is|priority|epic|parent):\S/i

export function jqlOf(text: string): string {
  if (JQL_LIKE.test(text)) return text
  const clauses: string[] = []
  const words: string[] = []
  const q = (v: string) => `"${v.replace(/"/g, '\\"')}"`
  for (const token of text.match(/(\S+:"[^"]*"|\S+)/g) ?? []) {
    const m = /^(-?)([a-z]+):"?([^"]*)"?$/i.exec(token)
    if (!m) {
      words.push(token)
      continue
    }
    const [, neg, rawKey, value] = m
    const key = rawKey!.toLowerCase()
    const v = value ?? ''
    const not = neg ? '!' : ''
    let clause: string | null = null
    if (key === 'assignee' || key === 'reporter') {
      clause = v === 'me' ? `${key} ${not}= currentUser()` : v === 'none' ? `${key} is ${neg ? 'not ' : ''}EMPTY` : `${key} ${not}= ${q(v)}`
    } else if (key === 'project') clause = `project ${not}= ${q(v)}`
    else if (key === 'status') clause = `status ${not}= ${q(v)}`
    else if (key === 'label') clause = `labels ${not}= ${q(v)}`
    else if (key === 'type') clause = `issuetype ${not}= ${q(v)}`
    else if (key === 'priority') clause = `priority ${not}= ${q(v)}`
    else if (key === 'epic' || key === 'parent') clause = `parent ${not}= ${q(v)}`
    else if (key === 'sprint') clause = v === 'current' ? `sprint ${neg ? 'not in' : 'in'} openSprints()` : `sprint ${not}= ${q(v)}`
    else if (key === 'is') {
      clause =
        v === 'open'
          ? `statusCategory ${neg ? '=' : '!='} Done`
          : v === 'done'
            ? `statusCategory ${neg ? '!=' : '='} Done`
            : `statusCategory ${not}= ${q(v)}`
    } else words.push(token)
    if (clause) clauses.push(clause)
  }
  if (words.length) clauses.push(`text ~ ${q(words.join(' '))}`)
  return `${clauses.join(' AND ') || 'assignee = currentUser()'} ORDER BY updated DESC`
}

export const meta: Meta = {
  name: 'Jira',
  command: 'jira',
  pane: 'jira-viewer',
  setupHelp: [
    'Create an API token at **id.atlassian.com → Security → API tokens**.',
    'Then export these before starting Claude Code, for example in `~/.config/zsh/secrets.zsh`:',
    '```sh\nexport JIRA_BASE_URL=https://your-site.atlassian.net\nexport JIRA_EMAIL=you@example.com\nexport JIRA_API_TOKEN=...\n```',
    'Restart Claude Code and press `r`.',
  ].join('\n\n'),
  searchHelp:
    'Qualifiers like assignee:pat, assignee:me, reporter:me, project:DO, status:"In Review", label:sre-aviation, type:Bug, sprint:current, is:open or priority:High search Jira. Raw JQL works too. Other words do a text search.',
  searchPlaceholder: 'project:DO sprint:current is:open',
}

export function isRemoteQuery(text: string): boolean {
  return QUALIFIER.test(text) || JQL_LIKE.test(text)
}

export async function check($: EngineInterface): Promise<string | null> {
  return (await config($)) ? null : 'Set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN.'
}

export async function me($: EngineInterface): Promise<string> {
  return (await myself($)).displayName
}

export function list($: EngineInterface): Promise<Ticket[]> {
  return searchJql($, LIST_JQL, 100)
}

export function search($: EngineInterface, query: string): Promise<Ticket[]> {
  return searchJql($, jqlOf(query), 50)
}

export async function detail($: EngineInterface, t: Ticket): Promise<TicketDetail> {
  const d = await api<{ fields: { description: unknown; comment?: { comments: { author: User; created: string; body: unknown }[] } } }>(
    $,
    `/rest/api/3/issue/${encodeURIComponent(t.key)}?fields=description,comment`,
  )
  return {
    description: adfToMarkdown(d.fields.description),
    comments: (d.fields.comment?.comments ?? []).map(c => ({
      author: c.author?.displayName ?? 'Jira',
      at: c.created,
      body: adfToMarkdown(c.body),
    })),
  }
}

export async function transitions($: EngineInterface, t: Ticket): Promise<Transition[]> {
  const d = await api<{ transitions: { id: string; name: string; to: { name: string; statusCategory: { key: string } } }[] }>(
    $,
    `/rest/api/3/issue/${encodeURIComponent(t.key)}/transitions`,
  )
  return d.transitions.map(tr => ({ id: tr.id, name: tr.to.name, type: statusTypeOf(tr.to.statusCategory.key, tr.to.name) }))
}

export async function transition($: EngineInterface, t: Ticket, to: Transition): Promise<void> {
  await api($, `/rest/api/3/issue/${encodeURIComponent(t.key)}/transitions`, { method: 'POST', body: { transition: { id: to.id } } })
}

export async function comment($: EngineInterface, t: Ticket, body: string): Promise<void> {
  await api($, `/rest/api/3/issue/${encodeURIComponent(t.key)}/comment`, { method: 'POST', body: { body: markdownToAdf(body) } })
}

export async function assignToMe($: EngineInterface, t: Ticket): Promise<void> {
  const self = await myself($)
  await api($, `/rest/api/3/issue/${encodeURIComponent(t.key)}/assignee`, { method: 'PUT', body: { accountId: self.accountId } })
}
