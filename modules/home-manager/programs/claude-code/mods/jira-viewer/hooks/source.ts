import type { EngineInterface } from 'claude-code'

import { adfToMarkdown, markdownToAdf } from './adf'
import type { Meta, Project, StatusType, Ticket, TicketDetail, Transition } from './core'

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
let mcpTools: string[] = []
let mcpSite: { cloudId: string; base: string } | null = null
let mcpMe: { accountId: string; displayName: string } | null = null

export const readTools = [
  'searchJiraIssuesUsingJql',
  'getJiraIssue',
  'getTransitionsForJiraIssue',
  'getAccessibleAtlassianResources',
  'atlassianUserInfo',
  'getVisibleJiraProjects',
]

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
    names.find(n => n.startsWith('mcp__') && !n.startsWith('mcp__jira-viewer__') && n.endsWith(`__${suffix}`)) ?? null
  const cached = hit(mcpTools)
  if (cached) return cached
  mcpTools = (await $.tool.list()).map(t => t.name)
  return hit(mcpTools)
}

function firstLineOf(text: string): string {
  return text.trim().split('\n')[0]?.slice(0, 200) ?? ''
}

async function mcp<T>($: EngineInterface, suffix: string, args: Record<string, unknown>): Promise<T> {
  const tool = await mcpTool($, suffix)
  if (!tool) throw new Error(`no Atlassian connector tool ${suffix}`)
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
  const text = await savedOutput($, out.text ?? '')
  if (out.isError && text === out.text) throw new Error(firstLineOf(out.text ?? `${suffix} failed`))
  try {
    return JSON.parse(text || 'null') as T
  } catch {
    throw new Error(`${suffix} returned something other than JSON: ${firstLineOf(text)}`)
  }
}

export async function savedOutput($: EngineInterface, text: string): Promise<string> {
  const path = /saved to (\/[^\s"'`]+?)[.,;:]?(?:\s|$)/.exec(text)?.[1]
  if (!path) return text
  const saved = String(await $.fs.read(path))
  try {
    const blocks = JSON.parse(saved) as unknown
    if (Array.isArray(blocks) && blocks.every(b => typeof b === 'object' && b && 'text' in b)) {
      return blocks.map(b => String((b as { text: unknown }).text)).join('')
    }
  } catch {}
  return saved
}

export async function backend($: EngineInterface): Promise<'connector' | 'api key' | null> {
  if (await mcpTool($, 'searchJiraIssuesUsingJql')) return 'connector'
  if (await config($)) return 'api key'
  return null
}

async function useMcp($: EngineInterface): Promise<boolean> {
  return (await backend($)) === 'connector'
}

async function site($: EngineInterface): Promise<{ cloudId: string; base: string }> {
  if (mcpSite) return mcpSite
  const raw = await mcp<unknown>($, 'getAccessibleAtlassianResources', {})
  const list = (Array.isArray(raw) ? raw : ((raw as { resources?: unknown[] })?.resources ?? [])) as { id: string; url: string; name?: string; scopes?: string[] }[]
  const want = (await $.env.get('JIRA_BASE_URL'))?.trim().replace(/\/+$/, '')
  const pick =
    list.find(r => want && r.url.replace(/\/+$/, '') === want) ??
    list.find(r => (r.scopes ?? []).some(sc => sc.includes('jira'))) ??
    list[0]
  if (!pick) throw new Error('The Atlassian connector has no accessible site')
  mcpSite = { cloudId: pick.id, base: pick.url.replace(/\/+$/, '') }
  return mcpSite
}

async function mcpMyself($: EngineInterface) {
  if (!mcpMe) {
    const u = await mcp<{ account_id?: string; accountId?: string; name?: string; displayName?: string }>($, 'atlassianUserInfo', {})
    mcpMe = { accountId: u.account_id ?? u.accountId ?? '', displayName: u.name ?? u.displayName ?? '' }
  }
  return mcpMe
}

function issuesOf(raw: unknown): Issue[] {
  const r = raw as { issues?: Issue[]; data?: { issues?: Issue[] } } | Issue[]
  if (Array.isArray(r)) return r
  return r?.issues ?? r?.data?.issues ?? []
}

async function mcpSearch($: EngineInterface, jql: string, max: number): Promise<Ticket[]> {
  const { cloudId, base } = await site($)
  const me = await mcpMyself($)
  const raw = await mcp<unknown>($, 'searchJiraIssuesUsingJql', { cloudId, jql, fields: FIELDS.filter(f => f !== 'comment'), maxResults: Math.min(max, 50) })
  return issuesOf(raw).filter(i => i?.key && i.fields).map(i => toTicket(i, base, me.accountId))
}

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
    'The viewer uses your **Atlassian connector** when one is connected. Connect it with `/mcp`, or in claude.ai under Settings → Connectors. If you have more than one site, set `JIRA_BASE_URL` to pick one.',
    'If you would rather use an API token, create one at **id.atlassian.com → Security → API tokens**, then export these before starting Claude Code, for example in `~/.config/zsh/secrets.zsh`:',
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


async function keyMe($: EngineInterface): Promise<string> {
  return (await myself($)).displayName
}

function keyList($: EngineInterface): Promise<Ticket[]> {
  return searchJql($, LIST_JQL, 100)
}

function keySearch($: EngineInterface, query: string): Promise<Ticket[]> {
  return searchJql($, jqlOf(query), 50)
}

async function keyDetail($: EngineInterface, t: Ticket): Promise<TicketDetail> {
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

async function keyTransitions($: EngineInterface, t: Ticket): Promise<Transition[]> {
  const d = await api<{ transitions: { id: string; name: string; to: { name: string; statusCategory: { key: string } } }[] }>(
    $,
    `/rest/api/3/issue/${encodeURIComponent(t.key)}/transitions`,
  )
  return d.transitions.map(tr => ({ id: tr.id, name: tr.to.name, type: statusTypeOf(tr.to.statusCategory.key, tr.to.name) }))
}

async function keyTransition($: EngineInterface, t: Ticket, to: Transition): Promise<void> {
  await api($, `/rest/api/3/issue/${encodeURIComponent(t.key)}/transitions`, { method: 'POST', body: { transition: { id: to.id } } })
}

async function keyComment($: EngineInterface, t: Ticket, body: string): Promise<void> {
  await api($, `/rest/api/3/issue/${encodeURIComponent(t.key)}/comment`, { method: 'POST', body: { body: markdownToAdf(body) } })
}

async function keyAssignToMe($: EngineInterface, t: Ticket): Promise<void> {
  const self = await myself($)
  await api($, `/rest/api/3/issue/${encodeURIComponent(t.key)}/assignee`, { method: 'PUT', body: { accountId: self.accountId } })
}

export async function check($: EngineInterface): Promise<string | null> {
  return (await backend($)) ? null : 'No Atlassian connector found, and JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN are not all set.'
}

export async function me($: EngineInterface): Promise<string> {
  return (await useMcp($)) ? (await mcpMyself($)).displayName : keyMe($)
}

export async function list($: EngineInterface): Promise<Ticket[]> {
  return (await useMcp($)) ? mcpSearch($, LIST_JQL, 100) : keyList($)
}

export async function search($: EngineInterface, query: string): Promise<Ticket[]> {
  return (await useMcp($)) ? mcpSearch($, jqlOf(query), 50) : keySearch($, query)
}

type Comments = { comments?: { author: User; created: string; body: unknown }[] }

export async function detail($: EngineInterface, t: Ticket): Promise<TicketDetail> {
  if (!(await useMcp($))) return keyDetail($, t)
  const { cloudId } = await site($)
  const raw = await mcp<{ fields?: { description?: unknown; comment?: Comments } }>($, 'getJiraIssue', { cloudId, issueIdOrKey: t.key })
  return {
    description: adfToMarkdown(raw.fields?.description),
    comments: (raw.fields?.comment?.comments ?? []).map(c => ({
      author: c.author?.displayName ?? 'Jira',
      at: c.created,
      body: adfToMarkdown(c.body),
    })),
  }
}

type RawTransition = { id: string; name: string; to: { name: string; statusCategory: { key: string } } }

export async function transitions($: EngineInterface, t: Ticket): Promise<Transition[]> {
  if (!(await useMcp($))) return keyTransitions($, t)
  const { cloudId } = await site($)
  const raw = await mcp<{ transitions?: RawTransition[] } | RawTransition[]>($, 'getTransitionsForJiraIssue', { cloudId, issueIdOrKey: t.key })
  const list = Array.isArray(raw) ? raw : (raw.transitions ?? [])
  return list.map(tr => ({ id: tr.id, name: tr.to?.name ?? tr.name, type: statusTypeOf(tr.to?.statusCategory?.key ?? '', tr.to?.name ?? tr.name) }))
}

export async function transition($: EngineInterface, t: Ticket, to: Transition): Promise<void> {
  if (!(await useMcp($))) return keyTransition($, t, to)
  const { cloudId } = await site($)
  await mcp($, 'transitionJiraIssue', { cloudId, issueIdOrKey: t.key, transition: { id: to.id } })
}

export async function comment($: EngineInterface, t: Ticket, body: string): Promise<void> {
  if (!(await useMcp($))) return keyComment($, t, body)
  const { cloudId } = await site($)
  await mcp($, 'addCommentToJiraIssue', { cloudId, issueIdOrKey: t.key, commentBody: body })
}

export async function assignToMe($: EngineInterface, t: Ticket): Promise<void> {
  if (!(await useMcp($))) return keyAssignToMe($, t)
  const { cloudId } = await site($)
  const self = await mcpMyself($)
  await mcp($, 'editJiraIssue', { cloudId, issueIdOrKey: t.key, fields: { assignee: { accountId: self.accountId } } })
}

type RawProject = { id?: string; key: string; name: string; archived?: boolean }

function projectsOf(raw: unknown): RawProject[] {
  const r = raw as { values?: RawProject[]; projects?: RawProject[] } | RawProject[]
  if (Array.isArray(r)) return r
  return r?.values ?? r?.projects ?? []
}

export async function projects($: EngineInterface): Promise<Project[]> {
  let raw: unknown
  if (await useMcp($)) {
    const { cloudId } = await site($)
    raw = await mcp<unknown>($, 'getVisibleJiraProjects', { cloudId })
  } else {
    raw = await api<unknown>($, '/rest/api/3/project/search?maxResults=100&orderBy=name')
  }
  return projectsOf(raw)
    .filter(pr => pr?.key && !pr.archived)
    .map(pr => ({ id: pr.key, name: pr.name }))
}

export function projectJql(key: string): string {
  return `project = "${key.replace(/"/g, '\\"')}" AND (statusCategory != Done OR resolved >= -14d) ORDER BY updated DESC`
}

export async function projectIssues($: EngineInterface, project: Project): Promise<Ticket[]> {
  const jql = projectJql(project.id)
  return (await useMcp($)) ? mcpSearch($, jql, 100) : searchJql($, jql, 100)
}
