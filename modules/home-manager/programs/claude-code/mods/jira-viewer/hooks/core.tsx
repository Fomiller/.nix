import type { Elements, EngineInterface, On, Timer } from 'claude-code'

import {
  check as srcCheck,
  me as srcMe,
  list as srcList,
  search as srcSearch,
  detail as srcDetail,
  transitions as srcTransitions,
  transition as srcTransition,
  comment as srcComment,
  assignToMe as srcAssignToMe,
  isRemoteQuery as srcIsRemoteQuery,
  meta,
  backend as srcBackend,
  blockedTools as srcBlockedTools,
  setBackground as srcSetBackground,
  projects as srcProjects,
  projectIssues as srcProjectIssues,
  readTools,
} from './source'

export type StatusType = 'triage' | 'backlog' | 'unstarted' | 'started' | 'review' | 'done' | 'canceled'

export type Ticket = {
  id: string
  key: string
  title: string
  url: string
  status: string
  statusType: StatusType
  priority: number
  priorityLabel: string
  assignee: string | null
  isAssignedToMe: boolean
  isCreatedByMe: boolean
  project: string | null
  team: string | null
  sprint: string | null
  parent: string | null
  labels: string[]
  estimate: number | null
  branch: string | null
  updatedAt: string
  lastCommentAt: string | null
  lastCommenter: string | null
}

export type Comment = { author: string; at: string; body: string }

export type TicketDetail = { description: string; comments: Comment[] }

export type Transition = { id: string; name: string; type: StatusType }

export type Project = { id: string; name: string }

export type Meta = {
  name: string
  command: string
  pane: string
  setupHelp: string
  searchHelp: string
  searchPlaceholder: string
}

type Els = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Markdown' | 'Input' | 'Link'>

type View = 'all' | 'mine' | 'todo' | 'progress' | 'review' | 'backlog' | 'created' | 'done' | 'search'
type GroupBy = 'project' | 'status' | 'sprint' | 'parent' | 'none'
type Prompting = 'comment' | 'status' | 'search' | 'project' | 'projectFilter' | null
type EventKind = 'assigned' | 'status' | 'comment'
type TicketEvent = { id: string; key: string; kind: EventKind; text: string; at: number }
type Snapshot = Record<string, { status: string; isAssignedToMe: boolean; lastCommentAt: string | null; updatedAt?: string }>
type Row = { kind: 'group'; name: string; count: number } | { kind: 'ticket'; t: Ticket }

const isOpen = (t: Ticket) => t.statusType !== 'done' && t.statusType !== 'canceled'

const VIEWS: { value: View; label: string; test: (t: Ticket, inProject: boolean) => boolean }[] = [
  { value: 'all', label: 'All', test: t => isOpen(t) },
  { value: 'mine', label: 'Mine', test: t => t.isAssignedToMe && isOpen(t) },
  { value: 'todo', label: 'Todo', test: (t, p) => (p || t.isAssignedToMe) && t.statusType === 'unstarted' },
  { value: 'progress', label: 'In progress', test: (t, p) => (p || t.isAssignedToMe) && t.statusType === 'started' },
  { value: 'review', label: 'In review', test: (t, p) => (p || t.isAssignedToMe) && t.statusType === 'review' },
  {
    value: 'backlog',
    label: 'Backlog',
    test: (t, p) => (p || t.isAssignedToMe) && (t.statusType === 'backlog' || t.statusType === 'triage'),
  },
  { value: 'created', label: 'Created', test: t => t.isCreatedByMe && isOpen(t) },
  { value: 'done', label: 'Done', test: (t, p) => (p || t.isAssignedToMe) && !isOpen(t) },
  { value: 'search', label: 'Search', test: () => true },
]

const GROUP_BYS: GroupBy[] = ['project', 'status', 'sprint', 'parent', 'none']

const STATUS_COLOR: Record<StatusType, string> = {
  triage: 'warning',
  backlog: 'inactive',
  unstarted: 'subtle',
  started: 'claude',
  review: 'suggestion',
  done: 'success',
  canceled: 'inactive',
}

const STATUS_ORDER: StatusType[] = ['review', 'started', 'unstarted', 'triage', 'backlog', 'done', 'canceled']

function priorityMark(p: number): { text: string; color: string } {
  switch (p) {
    case 1:
      return { text: '!!', color: 'error' }
    case 2:
      return { text: '▲ ', color: 'warning' }
    case 3:
      return { text: '■ ', color: 'suggestion' }
    case 4:
      return { text: '▽ ', color: 'inactive' }
    default:
      return { text: '· ', color: 'inactive' }
  }
}

function groupOf(t: Ticket, by: GroupBy): string {
  switch (by) {
    case 'project':
      return t.project ?? t.team ?? 'No project'
    case 'status':
      return t.status
    case 'sprint':
      return t.sprint ?? 'No sprint'
    case 'parent':
      return t.parent ?? 'No parent'
    default:
      return 'All'
  }
}

function rowsOf(list: Ticket[], by: GroupBy, collapsed: string[]): Row[] {
  const sorted = [...list].sort(
    (a, b) => (a.priority || 9) - (b.priority || 9) || b.updatedAt.localeCompare(a.updatedAt),
  )
  if (by === 'none') return sorted.map(t => ({ kind: 'ticket', t }))
  const map = new Map<string, Ticket[]>()
  for (const t of sorted) map.set(groupOf(t, by), [...(map.get(groupOf(t, by)) ?? []), t])
  const rank = (name: string) => {
    if (by !== 'status') return 0
    const t = map.get(name)?.[0]
    return t ? STATUS_ORDER.indexOf(t.statusType) : 99
  }
  const names = [...map.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  const rows: Row[] = []
  for (const name of names) {
    const items = map.get(name) ?? []
    rows.push({ kind: 'group', name, count: items.length })
    if (!collapsed.includes(name)) for (const t of items) rows.push({ kind: 'ticket', t })
  }
  return rows
}

const rowId = (r: Row) => (r.kind === 'ticket' ? r.t.key : `grp:${r.name}`)

function matchesFilter(t: Ticket, filter: string): boolean {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = [t.key, t.title, t.status, t.assignee ?? '', t.project ?? '', t.team ?? '', t.sprint ?? '', t.parent ?? '', ...t.labels]
    .join(' ')
    .toLowerCase()
  return words.every(w => hay.includes(w))
}

export function clip(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, Math.max(1, width - 1))}…`
}

function ago(iso: string, now: number): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000)
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

function bodyOf(body: string, lines: number): { text: string; isCut: boolean } {
  const all = body.trim().split('\n')
  if (all.length <= lines) return { text: all.join('\n'), isCut: false }
  let cut = all.slice(0, lines)
  if (cut.filter(l => l.trimStart().startsWith('```')).length % 2 === 1) cut = [...cut, '```']
  return { text: cut.join('\n'), isCut: true }
}

export function cleanMarkdown(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[a-z]+\b([^>]*)\/>/gi, (tag: string, attrs: string) => {
      const label = /label="([^"]*)"/.exec(attrs)?.[1]
      const href = /href="([^"]*)"/.exec(attrs)?.[1]
      return label && href ? `[${label}](${href})` : label ?? tag
    })
    .replace(/<summary>([\s\S]*?)<\/summary>/gi, '**$1**')
    .replace(/<\/?details[^>]*>/gi, '')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, src: string) => `[${alt || 'image'}](${src})`)
    .replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, '[image]($1)')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const source = meta

const S = {
  tickets: [] as Ticket[],
  results: [] as Ticket[],
  view: 'mine' as View,
  groupBy: 'project' as GroupBy,
  mode: 'list' as 'list' | 'detail',
  selected: null as string | null,
  collapsed: [] as string[],
  status: null as { text: string; isError: boolean } | null,
  isLoading: false,
  isSearching: false,
  confirm: null as string | null,
  prompting: null as Prompting,
  fetchedAt: 0,
  filter: '',
  searchQuery: '',
  offset: 0,
  expanded: [] as string[],
  events: [] as TicketEvent[],
  transitions: null as { key: string; list: Transition[] } | null,
  setupError: null as string | null,
  pollMinutes: 5,
  backend: null as string | null,
  project: null as Project | null,
  projects: [] as Project[],
  projectsAt: 0,
  projectTickets: [] as Ticket[],
  projectCursor: 0,
  projectFilter: '',
}
const details = new Map<string, TicketDetail>()
const ownChanges = new Map<string, number>()
let poll: Timer | undefined

function redraw($: EngineInterface) {
  $.ui.invalidate('ui.render')
}
function set($: EngineInterface, patch: Partial<typeof S>) {
  Object.assign(S, patch)
  redraw($)
}
const find = (key: string | null) =>
  key
    ? (S.tickets.find(t => t.key === key) ??
      S.projectTickets.find(t => t.key === key) ??
      S.results.find(t => t.key === key) ??
      null)
    : null

const scopeTickets = () => (S.project ? S.projectTickets : S.tickets)
const groupByNow = (): GroupBy => (S.project && S.groupBy === 'project' ? 'status' : S.groupBy)
const countIn = (v: (typeof VIEWS)[number]) =>
  v.value === 'search' ? S.results.length : scopeTickets().filter(t => v.test(t, S.project !== null)).length

const shown = () => {
  const current = VIEWS.find(v => v.value === S.view) ?? VIEWS[0]!
  const base = S.view === 'search' ? S.results : scopeTickets().filter(t => current.test(t, S.project !== null))
  return base.filter(t => matchesFilter(t, S.filter))
}
const rows = () => rowsOf(shown(), groupByNow(), S.collapsed)

async function loadProjects($: EngineInterface, force = false) {
  if (!force && S.projects.length > 0 && Date.now() - S.projectsAt < 10 * 60_000) return
  try {
    const list = await srcProjects($)
    S.projects = [...list].sort((a, b) => a.name.localeCompare(b.name))
    S.projectsAt = Date.now()
  } catch (err) {
    S.status = { text: `Could not load projects: ${errorText(err)}`, isError: true }
  }
  redraw($)
}

async function loadProjectTickets($: EngineInterface) {
  const p = S.project
  if (!p) return
  set($, { isLoading: true })
  try {
    const list = await srcProjectIssues($, p)
    if (S.project?.id === p.id) S.projectTickets = list
  } catch (err) {
    S.status = { text: `Could not load ${p.name}: ${errorText(err)}`, isError: true }
  } finally {
    S.isLoading = false
    redraw($)
  }
  ensureCursor($)
}

async function selectProject($: EngineInterface, p: Project | null) {
  set($, {
    project: p,
    projectTickets: [],
    prompting: null,
    mode: 'list',
    view: p ? 'all' : 'mine',
    selected: null,
    filter: '',
    collapsed: [],
  })
  await $.store.set('project', p)
  if (p) await loadProjectTickets($)
  else ensureCursor($)
}

async function stepProject($: EngineInterface, delta: number) {
  await loadProjects($)
  const order: (Project | null)[] = [null, ...S.projects]
  const at = order.findIndex(p => (p?.id ?? null) === (S.project?.id ?? null))
  await selectProject($, order[(at + delta + order.length) % order.length] ?? null)
}

function projectsShown(): Project[] {
  const f = S.projectFilter.toLowerCase()
  return f ? S.projects.filter(p => p.name.toLowerCase().includes(f) || p.id.toLowerCase().includes(f)) : S.projects
}

function matchProject(text: string): Project | null {
  const q = text.trim().toLowerCase()
  return (
    S.projects.find(p => p.id.toLowerCase() === q || p.name.toLowerCase() === q) ??
    S.projects.find(p => p.name.toLowerCase().includes(q)) ??
    null
  )
}

async function loadDetail($: EngineInterface, key: string, force = false) {
  const t = find(key)
  if (!t || (details.has(key) && !force)) return
  try {
    details.set(key, await srcDetail($, t))
  } catch (err) {
    S.status = { text: `Could not load ${key}: ${errorText(err)}`, isError: true }
  }
  redraw($)
}

function cursorTo($: EngineInterface, to: (i: number, r: Row[]) => number) {
  const r = rows()
  if (r.length === 0) return
  const at = r.findIndex(x => rowId(x) === S.selected)
  const row = r[Math.min(r.length - 1, Math.max(0, to(at, r)))]
  if (!row) return
  set($, { selected: rowId(row), confirm: null })
  if (row.kind === 'ticket') void loadDetail($, row.t.key)
}
const firstTicket = (_: number, r: Row[]) => Math.max(0, r.findIndex(x => x.kind === 'ticket'))

function ensureCursor($: EngineInterface) {
  if (!rows().some(r => rowId(r) === S.selected)) cursorTo($, firstTicket)
  else if (S.selected) void loadDetail($, S.selected)
}

async function pushEvents($: EngineInterface, found: Omit<TicketEvent, 'id' | 'at'>[]) {
  if (found.length === 0) return
  const now = await $.clock.now()
  const fresh = found.map((f, i) => ({ ...f, id: `${now}-${i}`, at: now }))
  S.events = [...fresh, ...S.events.filter(e => !fresh.some(f => f.key === e.key && f.kind === e.kind))].slice(0, 30)
  if (fresh.length > 3) $.ui.toast(`${fresh.length} ${source.name} updates. Press ctrl+x tab, then o to open the newest.`, { timeoutMs: 8000 })
  else for (const f of fresh) $.ui.toast(f.text, { timeoutMs: 8000 })
  redraw($)
}

function changesOf(before: Snapshot, list: Ticket[], me: string): Omit<TicketEvent, 'id' | 'at'>[] {
  const out: Omit<TicketEvent, 'id' | 'at'>[] = []
  const now = Date.now()
  for (const t of list) {
    const was = before[t.key]
    const ref = `${t.key} ${t.title}`
    const isOwn = (ownChanges.get(t.key) ?? 0) > now - 10 * 60_000
    if (t.isAssignedToMe && (!was || !was.isAssignedToMe) && isOpen(t)) {
      out.push({ key: t.key, kind: 'assigned', text: `Assigned to you: ${ref}` })
      continue
    }
    if (!was) continue
    if (was.status !== t.status && !isOwn) {
      out.push({ key: t.key, kind: 'status', text: `${was.status} → ${t.status}: ${ref}` })
    }
    if (t.lastCommentAt && t.lastCommentAt !== was.lastCommentAt && t.lastCommenter && t.lastCommenter !== me) {
      out.push({ key: t.key, kind: 'comment', text: `${t.lastCommenter} commented: ${ref}` })
    }
  }
  return out
}

async function fillComments($: EngineInterface, list: Ticket[], before: Snapshot | undefined) {
  for (const t of list) {
    const was = before?.[t.key]
    if (t.lastCommentAt === null && was && was.updatedAt === t.updatedAt) {
      t.lastCommentAt = was.lastCommentAt
      t.lastCommenter = null
    }
  }
  const changed = list.filter(t => t.lastCommentAt === null && isOpen(t) && (!before?.[t.key] || before[t.key]!.updatedAt !== t.updatedAt))
  for (const t of changed.slice(0, 8)) {
    try {
      const d = await srcDetail($, t)
      details.set(t.key, d)
      const last = [...d.comments].sort((a, b) => b.at.localeCompare(a.at))[0]
      t.lastCommentAt = last?.at ?? null
      t.lastCommenter = last?.author ?? null
    } catch {}
  }
}

async function refresh($: EngineInterface, quiet = false): Promise<string | null> {
  srcSetBackground(quiet)
  try {
    return await refreshNow($, quiet)
  } finally {
    srcSetBackground(false)
    redraw($)
  }
}

async function refreshNow($: EngineInterface, quiet: boolean): Promise<string | null> {
  const setup = await srcCheck($)
  if (setup) {
    set($, { setupError: setup })
    return setup
  }
  if (!quiet) set($, { isLoading: true, setupError: null })
  try {
    const [list, me] = await Promise.all([srcList($), srcMe($)])
    S.backend = await srcBackend($)
    const before = (await $.store.get('snapshot')) as Snapshot | undefined
    await fillComments($, list, before)
    if (before) await pushEvents($, changesOf(before, list, me))
    const snap: Snapshot = {}
    for (const t of list) snap[t.key] = { status: t.status, isAssignedToMe: t.isAssignedToMe, lastCommentAt: t.lastCommentAt, updatedAt: t.updatedAt }
    await $.store.set('snapshot', snap)
    S.tickets = list
    S.fetchedAt = Date.now()
    if (!quiet) S.status = null
    for (const t of list) if (details.has(t.key) && find(t.key)?.updatedAt !== t.updatedAt) details.delete(t.key)
    if (!quiet && S.project) await loadProjectTickets($)
    if (!quiet) ensureCursor($)
    return null
  } catch (err) {
    const msg = `Could not load ${source.name}: ${errorText(err)}`
    if (!quiet) S.status = { text: msg, isError: true }
    return msg
  } finally {
    S.isLoading = false
    redraw($)
  }
}

async function runSearch($: EngineInterface, text: string) {
  set($, { isSearching: true, searchQuery: text, view: 'search', filter: '', selected: null })
  try {
    S.results = await srcSearch($, text)
    S.status = null
  } catch (err) {
    S.status = { text: `Search failed: ${errorText(err)}`, isError: true }
  } finally {
    S.isSearching = false
    redraw($)
  }
  cursorTo($, firstTicket)
}

async function applySearch($: EngineInterface, text: string) {
  const q = text.trim()
  S.prompting = null
  if (!q) return clearSearch($)
  if (S.view === 'search' || srcIsRemoteQuery(q)) return runSearch($, q)
  set($, { filter: q, selected: null })
  cursorTo($, firstTicket)
}

function clearSearch($: EngineInterface) {
  S.filter = ''
  if (S.view === 'search') {
    S.searchQuery = ''
    S.results = []
  }
  set($, { selected: null })
  cursorTo($, firstTicket)
}

async function act($: EngineInterface, doing: string, t: Ticket, run: () => Promise<void>) {
  set($, { confirm: null, prompting: null, status: { text: `${doing}…`, isError: false } })
  try {
    ownChanges.set(t.key, Date.now())
    await run()
    await refresh($, true)
    if (S.project) S.projectTickets = await srcProjectIssues($, S.project)
    if (S.view === 'search' && S.searchQuery) S.results = await srcSearch($, S.searchQuery)
    await loadDetail($, t.key, true)
    set($, { status: { text: `${doing}: done`, isError: false } })
  } catch (err) {
    set($, { status: { text: `${doing} failed: ${errorText(err)}`, isError: true } })
  }
}

async function openTicket($: EngineInterface, key: string) {
  set($, { selected: key, mode: 'detail', offset: 0, confirm: null, prompting: null })
  S.events = S.events.filter(e => e.key !== key)
  await loadDetail($, key)
}

function step($: EngineInterface, delta: number) {
  const list = rows().filter(r => r.kind === 'ticket')
  if (list.length === 0) return
  const at = list.findIndex(r => rowId(r) === S.selected)
  const row = list[(at + delta + list.length) % list.length]
  if (row) void openTicket($, rowId(row))
}

async function openStatusPicker($: EngineInterface, t: Ticket) {
  set($, { prompting: 'status', transitions: null })
  try {
    set($, { transitions: { key: t.key, list: await srcTransitions($, t) } })
  } catch (err) {
    set($, { prompting: null, status: { text: `Statuses: ${errorText(err)}`, isError: true } })
  }
}

async function openInBrowser($: EngineInterface, url: string) {
  for (const opener of ['open', 'xdg-open']) {
    try {
      if ((await $.process.run([opener, url], { timeoutMs: 10_000 })).exitCode === 0) return
    } catch {}
  }
  set($, { status: { text: `Could not open a browser for ${url}`, isError: true } })
}

function askClaude($: EngineInterface, t: Ticket, kind: 'start' | 'ask') {
  const text =
    kind === 'start'
      ? `Start work on ${source.name} ticket ${t.key}: ${t.title} (${t.url}). Read the ticket first, then set up the worktree for it.`
      : `Look at ${source.name} ticket ${t.key} (${t.url}). Summarize what it asks for, what has been said in the comments, and what is left to do.`
  void $.prompt.submit({ text })
}

function startPolling($: EngineInterface) {
  poll?.cancel()
  poll = undefined
  if (S.pollMinutes <= 0) return
  poll = $.clock.every(S.pollMinutes * 60_000, () => {
    if (!S.isLoading) void refresh($, true)
  })
}

function openPane($: EngineInterface) {
  return $.ui.open({ id: source.pane, title: source.name, focus: true })
}

function chip(els: Els, text: string, color: string) {
  const { Text } = els
  return (
    <Text backgroundColor={color} color="inverseText" bold>
      {` ${text} `}
    </Text>
  )
}

function rule(els: Els, width: number, label?: string) {
  const { Text } = els
  if (!label) return <Text color="promptBorder">{'─'.repeat(Math.max(4, width - 1))}</Text>
  return (
    <Text>
      <Text color="promptBorder">── </Text>
      <Text color="subtle" bold>
        {label}
      </Text>
      <Text color="promptBorder"> {'─'.repeat(Math.max(2, width - label.length - 5))}</Text>
    </Text>
  )
}

function header(els: Els, t: Ticket, width: number, now: number) {
  const { Box, Text, Link } = els
  const p = priorityMark(t.priority)
  return (
    <Box flexDirection="column">
      <Text bold>{clip(t.title, width)}</Text>
      <Box flexDirection="row" columnGap={1} flexWrap="wrap">
        {chip(els, t.status, STATUS_COLOR[t.statusType])}
        {t.priority > 0 && chip(els, t.priorityLabel, p.color)}
        {t.estimate !== null && chip(els, `${t.estimate} pt`, 'inactive')}
        <Link href={t.url} label={t.key} />
      </Box>
      <Text>
        <Text color="suggestion">{t.assignee ? `@${t.assignee}` : 'unassigned'}</Text>
        <Text dimColor>
          {clip(
            [t.project ?? t.team, t.sprint, t.parent ? `parent ${t.parent}` : null, `${ago(t.updatedAt, now)} ago`]
              .filter(Boolean)
              .map(s => ` · ${s}`)
              .join(''),
            Math.max(10, width - (t.assignee?.length ?? 10) - 2),
          )}
        </Text>
      </Text>
      {t.labels.length > 0 && (
        <Box flexDirection="row" columnGap={1} flexWrap="wrap">
          {t.labels.slice(0, 6).map(l => chip(els, l, 'permission'))}
        </Box>
      )}
      {t.branch && <Text dimColor>{clip(`branch ${t.branch}`, width)}</Text>}
    </Box>
  )
}

function commentCard(els: Els, c: Comment, opts: { key: string; now: number; lines: number; isExpanded: boolean }) {
  const { Box, Text, Markdown } = els
  const body = bodyOf(cleanMarkdown(c.body), opts.isExpanded ? 400 : opts.lines)
  return (
    <Box key={opts.key} flexDirection="column" borderStyle="round" borderColor="promptBorder" paddingX={1}>
      <Text>
        <Text bold color="claude">
          {c.author}
        </Text>
        <Text dimColor>{c.at ? ` ${ago(c.at, opts.now)} ago` : ''}</Text>
      </Text>
      {body.text !== '' && <Markdown text={body.text} />}
      {body.isCut && <Text dimColor>… z shows the whole comment</Text>}
    </Box>
  )
}

export function registerTracker(on: On): void {
  {
    on('session.start', async ($, e, next) => {
      Object.assign(S, { tickets: [], results: [], events: [], selected: null, mode: 'list', prompting: null })
      details.clear()
      await $.command.register({
        name: source.command,
        description: `Open the ${source.name} ticket viewer (args: refresh | project [name|mine] | search <query> | poll <minutes|off>)`,
        argumentHint: '[refresh | project [name] | search <query> | poll 5]',
      })
      await $.tool.register({
        name: 'search_tickets',
        description: `Search ${source.name} tickets. ${source.searchHelp} Returns JSON.`,
        inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      })
      const groupBy = await $.store.get('groupBy')
      if (typeof groupBy === 'string' && GROUP_BYS.includes(groupBy as GroupBy)) S.groupBy = groupBy as GroupBy
      const minutes = await $.store.get('pollMinutes')
      if (typeof minutes === 'number') S.pollMinutes = minutes
      const project = (await $.store.get('project')) as Project | null | undefined
      if (project && typeof project.id === 'string') {
        S.project = project
        S.view = 'all'
      }
      startPolling($)
      $.clock.after(8_000, () => void refresh($, true))
      return next(e)
    })

    on('command.run', { command: source.command }, async ($, e) => {
      const [sub, ...rest] = e.args.trim().split(/\s+/)
      if (sub === 'poll') {
        const arg = rest[0] ?? ''
        const minutes = arg === 'off' ? 0 : Number(arg)
        if (!Number.isFinite(minutes) || minutes < 0) return { text: `Usage: /${source.command} poll <minutes> or off` }
        S.pollMinutes = minutes
        await $.store.set('pollMinutes', minutes)
        startPolling($)
        return { text: minutes > 0 ? `Checking ${source.name} every ${minutes} min.` : `Background ${source.name} checks are off.` }
      }
      await openPane($)
      const setup = await srcCheck($)
      if (setup) {
        set($, { setupError: setup })
        return { text: setup }
      }
      if (sub === 'project') {
        const q = rest.join(' ').trim()
        await loadProjects($, true)
        if (!q) {
          set($, { prompting: 'project', projectCursor: 0, projectFilter: '' })
          return { text: `Pick a ${source.name} project in the pane.` }
        }
        if (/^(mine|me|none|my work)$/i.test(q)) {
          await selectProject($, null)
          return { text: 'Showing your own tickets.' }
        }
        const p = matchProject(q)
        if (!p) return { text: `No open project matches "${q}".` }
        await selectProject($, p)
        return { text: `Showing ${p.name}: ${S.projectTickets.length} ticket(s).` }
      }
      if (sub === 'search') {
        const q = rest.join(' ').trim()
        if (!q) return { text: `Usage: /${source.command} search <query>` }
        await runSearch($, q)
        return { text: `${S.results.length} ticket(s) for: ${q}` }
      }
      if (sub === 'refresh' || Date.now() - S.fetchedAt > 5 * 60_000) {
        const err = await refresh($)
        return { text: err ?? `${source.name} viewer opened.` }
      }
      if (S.project && S.projectTickets.length === 0) await loadProjectTickets($)
      ensureCursor($)
      return { text: `${source.name} viewer opened.` }
    })

    on('tool.call', { tool: `mcp__${source.pane}__search_tickets` }, async ($, e) => {
      const q = String((e as unknown as { query?: unknown }).query ?? '').trim()
      if (!q) return { deny: 'query must be a non-empty string' }
      const setup = await srcCheck($)
      if (setup) return { deny: setup }
      const found = await srcSearch($, q)
      return {
        result: JSON.stringify(
          found.map(t => ({ key: t.key, title: t.title, status: t.status, assignee: t.assignee, priority: t.priorityLabel, project: t.project, url: t.url })),
          null,
          1,
        ),
      }
    }).catch(($, e, next) => (next.called ? next(e) : { deny: `${source.name} search failed.` }))

    on('tool.check', async ($, e, next) => {
      const isOwnRead =
        next.origin.plugin === source.pane &&
        e.tool.startsWith('mcp__') &&
        readTools.some(r => e.tool.endsWith(`__${r}`))
      return isOwnRead ? { decision: 'allow', reason: `${source.name} viewer read` } : next(e)
    })

    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      const top = S.events[0]
      if (e.props.hasSurvey || !top) return next(e)
      const { Box, Button, Text } = $.ui.resolve(e)
      const below = await next(e)
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" columnGap={1} flexWrap="wrap">
            <Text color="claude">{source.name}</Text>
            <Text>{clip(top.text, Math.max(20, e.props.bodyColumns - 40))}</Text>
            {S.events.length > 1 && <Text dimColor>+{S.events.length - 1}</Text>}
            <Button key={`${source.pane}-open`} label="open" onPress={() => void (async () => {
              await openPane($)
              await openTicket($, top.key)
            })()} />
            <Button key={`${source.pane}-dismiss`} label="dismiss" onPress={() => set($, { events: S.events.slice(1) })} />
            {S.events.length > 1 && <Button key={`${source.pane}-clear`} label="clear all" onPress={() => set($, { events: [] })} />}
          </Box>
          {below}
        </Box>
      )
    })

    on('ui.render', { component: 'Pane', requestId: source.pane }, async ($, e) => {
      const els = $.ui.resolve(e)
      const { Box, Text, Button, Input, Markdown } = els
      const width = Math.max(30, e.props.bodyColumns)
      const height = Math.max(12, e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 30)
      const now = Date.now()
      const current = VIEWS.find(v => v.value === S.view) ?? VIEWS[0]!
      const allRows = rows()
      const t = find(S.selected)
      const isAsking = (a: string) => t !== null && S.confirm === `${a}:${t.key}`

      const key = (k: string, label: string, run: () => unknown, color?: string) => (
        <Button key={`key-${k}`} plain hotkey={k} onPress={() => void run()}>
          {color ? <Text color={color} bold>{label}</Text> : <Text color="subtle">{label}</Text>}
        </Button>
      )
      const keyBar = (groups: ReturnType<typeof key>[][]) => (
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          {groups.filter(g => g.length > 0).flatMap((g, i) => (i === 0 ? g : [<Text color="promptBorder">│</Text>, ...g]))}
        </Box>
      )
      const statusLine = (
        <Box flexDirection="row" columnGap={1}>
          {(S.isLoading || S.isSearching) && chip(els, S.isSearching ? 'searching' : 'loading', 'warning')}
          {S.status && <Text color={S.status.isError ? 'error' : 'subtle'}>{clip(S.status.text, width - 14)}</Text>}
          {!S.isLoading && !S.isSearching && !S.status && (
            <Text dimColor>
              {S.fetchedAt ? `updated ${ago(new Date(S.fetchedAt).toISOString(), now)} ago` : 'not loaded'}
              {S.pollMinutes > 0 ? ` · checks every ${S.pollMinutes}m` : ' · background checks off'}
              {S.backend ? ` · via ${S.backend}` : ''}
              {srcBlockedTools().length > 0 ? ' · background checks paused' : ''}
            </Text>
          )}
          {(S.filter || (S.view === 'search' && S.searchQuery)) && (
            <Text>
              <Text color="suggestion"> / </Text>
              <Text bold>{S.view === 'search' ? S.searchQuery : S.filter}</Text>
            </Text>
          )}
        </Box>
      )

      if (S.setupError) {
        return (
          <Box flexDirection="column" rowGap={1}>
            {chip(els, `${source.name} is not set up`, 'warning')}
            <Markdown text={`${S.setupError}\n\n${source.setupHelp}`} />
            <Button key="setup-retry" hotkey="r" label="retry" onPress={() => void refresh($)} />
          </Box>
        )
      }

      if (S.prompting === 'search') {
        const isRemote = S.view === 'search'
        return (
          <Box flexDirection="column" rowGap={1}>
            {chip(els, isRemote ? `Search ${source.name}` : `Find in ${current.label}`, 'claude')}
            <Text dimColor>
              {isRemote ? source.searchHelp : `Words filter this view by key, title, status, assignee, project, sprint and labels. ${source.searchHelp}`}
            </Text>
            <Box borderStyle="round" borderColor="claude" paddingX={1}>
              <Input key="input-search" label="/" value={isRemote ? S.searchQuery : S.filter} placeholder={source.searchPlaceholder} submitLabel="search" autoFocus onSubmit={v => void applySearch($, v)} />
            </Box>
            <Button key="input-cancel" label="Cancel" onPress={() => set($, { prompting: null })} />
          </Box>
        )
      }

      if (S.prompting === 'projectFilter') {
        return (
          <Box flexDirection="column" rowGap={1}>
            {chip(els, 'Find a project', 'claude')}
            <Box borderStyle="round" borderColor="claude" paddingX={1}>
              <Input key="input-project" label="/" value={S.projectFilter} placeholder="name or key" submitLabel="filter" autoFocus onSubmit={v => set($, { projectFilter: v.trim(), projectCursor: 0, prompting: 'project' })} />
            </Box>
          </Box>
        )
      }

      if (S.prompting === 'project') {
        const options: (Project | null)[] = [null, ...projectsShown()]
        const cur = Math.min(S.projectCursor, options.length - 1)
        const room = Math.max(5, height - 8)
        const startAt = Math.min(Math.max(0, cur - Math.floor(room / 2)), Math.max(0, options.length - room))
        const choose = (p: Project | null) => void selectProject($, p)
        return (
          <Box flexDirection="column">
            <Box flexDirection="row" columnGap={1}>
              {chip(els, `${source.name} projects`, 'claude')}
              {S.projectFilter ? <Text color="suggestion">/ {S.projectFilter}</Text> : <Text dimColor>{`${S.projects.length} open`}</Text>}
            </Box>
            {statusLine}
            {rule(els, width)}
            {S.projects.length === 0 && <Text dimColor>Loading projects…</Text>}
            {startAt > 0 && <Text dimColor>  ↑ {startAt} more</Text>}
            {options.slice(startAt, startAt + room).map((p, j) => {
              const i = startAt + j
              const isCursor = i === cur
              const isCurrent = (p?.id ?? null) === (S.project?.id ?? null)
              const digit = i <= 9 ? String(i) : undefined
              return (
                <Button key={`project-${p?.id ?? 'mine'}`} plain hotkey={digit} onPress={() => choose(p)}>
                  <Text color={isCursor ? 'claude' : 'promptBorder'}>{isCursor ? '▌' : ' '}</Text>
                  <Text bold={isCursor} inverse={isCursor}>{` ${clip(p ? p.name : 'My work', width - 20)} `}</Text>
                  {p && p.id !== p.name ? <Text dimColor>{` ${p.id}`}</Text> : ''}
                  {isCurrent ? <Text color="success"> current</Text> : ''}
                </Button>
              )
            })}
            {startAt + room < options.length && <Text dimColor>  ↓ {options.length - startAt - room} more</Text>}
            {rule(els, width)}
            {keyBar([
              [
                key('j', 'down', () => set($, { projectCursor: Math.min(cur + 1, options.length - 1) })),
                key('k', 'up', () => set($, { projectCursor: Math.max(0, cur - 1) })),
                key('g', 'top', () => set($, { projectCursor: 0 })),
                key('e', 'end', () => set($, { projectCursor: options.length - 1 })),
                key('l', 'choose', () => choose(options[cur] ?? null)),
              ],
              [
                key('f', 'find', () => set($, { prompting: 'projectFilter' })),
                ...(S.projectFilter ? [key('u', 'clear', () => set($, { projectFilter: '', projectCursor: 0 }))] : []),
                key('r', 'reload', () => loadProjects($, true)),
                key('h', 'cancel', () => set($, { prompting: null })),
              ],
            ])}
          </Box>
        )
      }

      if (S.prompting === 'comment' && t) {
        return (
          <Box flexDirection="column" rowGap={1}>
            {header(els, t, width, now)}
            <Box borderStyle="round" borderColor="claude" paddingX={1}>
              <Input key="input-comment" label="Comment" placeholder="Markdown is fine. Enter posts." rows={5} autoFocus onSubmit={v => {
                if (v.trim()) void act($, 'Comment', t, () => srcComment($, t, v))
              }} />
            </Box>
            <Button key="input-cancel" label="Cancel" onPress={() => set($, { prompting: null })} />
          </Box>
        )
      }

      if (S.prompting === 'status' && t) {
        const list = S.transitions?.key === t.key ? S.transitions.list : null
        return (
          <Box flexDirection="column" rowGap={1}>
            {header(els, t, width, now)}
            {rule(els, width, 'move to')}
            {list === null && <Text dimColor>Loading statuses…</Text>}
            <Box flexDirection="column">
              {(list ?? []).slice(0, 9).map((tr, i) => (
                <Button key={`status-${tr.id}`} plain hotkey={String(i + 1)} onPress={() => void act($, `Move to ${tr.name}`, t, () => srcTransition($, t, tr))}>
                  <Text color={STATUS_COLOR[tr.type]} bold={tr.name === t.status}>{` ${tr.name}`}</Text>
                  {tr.name === t.status ? <Text dimColor> (current)</Text> : ''}
                </Button>
              ))}
            </Box>
            <Button key="input-cancel" hotkey="h" label="cancel" onPress={() => set($, { prompting: null })} />
          </Box>
        )
      }

      if (S.mode === 'detail' && t) {
        const d = details.get(t.key) ?? null
        const comments = d ? [...d.comments].sort((a, b) => b.at.localeCompare(a.at)) : []
        const blocks = [
          ...(d && d.description.trim() ? [{ id: `${t.key}#desc`, c: null as Comment | null }] : []),
          ...comments.map((c, i) => ({ id: `${t.key}#${c.at}-${i}`, c: c as Comment | null })),
        ]
        const offset = Math.min(S.offset, Math.max(0, blocks.length - 1))
        const top = blocks[offset]
        const room = Math.max(1, Math.floor((height - 14) / 8))
        const visible = blocks.slice(offset, offset + room)
        const nav = [
          key('h', 'back', () => set($, { mode: 'list' })),
          key('j', 'down', () => set($, { offset: Math.min(offset + 1, Math.max(0, blocks.length - 1)) })),
          key('k', 'up', () => set($, { offset: Math.max(0, offset - 1) })),
          key('g', 'top', () => set($, { offset: 0 })),
          key('z', top && S.expanded.includes(top.id) ? 'shrink' : 'expand', () => {
            if (top) set($, { expanded: S.expanded.includes(top.id) ? S.expanded.filter(x => x !== top.id) : [...S.expanded, top.id] })
          }),
          key('n', 'next', () => step($, 1)),
          key('p', 'prev', () => step($, -1)),
        ]
        const actions = [
          key('s', 'status', () => openStatusPicker($, t)),
          key('c', 'comment', () => set($, { prompting: 'comment' })),
          ...(!t.isAssignedToMe
            ? [key('a', isAsking('assign') ? 'again to take it' : 'assign to me', () => {
                if (isAsking('assign')) void act($, 'Assign to me', t, () => srcAssignToMe($, t))
                else set($, { confirm: `assign:${t.key}` })
              }, isAsking('assign') ? 'warning' : undefined)]
            : []),
          key('w', 'start work', () => askClaude($, t, 'start')),
          key('i', 'ask Claude', () => askClaude($, t, 'ask')),
        ]
        const misc = [
          key('y', 'copy key', () => $.ui.copy({ text: t.key })),
          key('o', 'browser', () => openInBrowser($, t.url)),
          key('r', 'refresh', async () => {
            await refresh($)
            await loadDetail($, t.key, true)
          }),
          key('q', 'quit', () => $.ui.close({ id: source.pane })),
        ]
        return (
          <Box flexDirection="column">
            <Box borderStyle="round" borderColor="claude" paddingX={1} flexDirection="column">
              {header(els, t, width - 4, now)}
            </Box>
            {statusLine}
            {keyBar([nav, actions, misc])}
            {rule(els, width, d === null ? 'loading' : `${comments.length} comment${comments.length === 1 ? '' : 's'}${blocks.length ? ` · ${offset + 1}/${blocks.length}` : ''}`)}
            {d !== null && blocks.length === 0 && <Text dimColor>No description or comments yet.</Text>}
            {visible.map(({ id, c }) =>
              c === null ? (
                <Box key={id} flexDirection="column" paddingX={1}>
                  <Markdown text={bodyOf(cleanMarkdown(d?.description ?? ''), S.expanded.includes(id) ? 400 : 14).text} />
                  {!S.expanded.includes(id) && bodyOf(cleanMarkdown(d?.description ?? ''), 14).isCut && <Text dimColor>… z shows the whole description</Text>}
                </Box>
              ) : (
                commentCard(els, c, { key: id, now, lines: 8, isExpanded: S.expanded.includes(id) })
              ),
            )}
            {offset + room < blocks.length && <Text dimColor>↓ {blocks.length - offset - room} more · j</Text>}
          </Box>
        )
      }

      const isWide = width >= 110
      const listWidth = isWide ? Math.floor(width * 0.5) : width
      const listRoom = isWide ? Math.max(4, height - 10) : Math.max(4, Math.min(allRows.length, Math.floor((height - 10) * 0.5)))
      const cursor = Math.max(0, allRows.findIndex(r => rowId(r) === S.selected))
      const start = Math.min(Math.max(0, cursor - Math.floor(listRoom / 2)), Math.max(0, allRows.length - listRoom))
      const windowed = allRows.slice(start, start + listRoom)
      const cursorRow = allRows[cursor]
      const cursorT = cursorRow?.kind === 'ticket' ? cursorRow.t : null

      const tabs = VIEWS.map((v, i) => {
        const count = countIn(v)
        const isOn = v.value === S.view
        return (
          <Button key={`view-${v.value}`} plain hotkey={String((i + 1) % 10)} onPress={() => {
            set($, { view: v.value, selected: null })
            cursorTo($, firstTicket)
          }}>
            {isOn ? (
              <Text backgroundColor="claude" color="inverseText" bold>{` ${v.label} ${count} `}</Text>
            ) : (
              <Text>
                <Text color={count ? 'text' : 'inactive'}>{v.label}</Text>
                <Text dimColor>{` ${count}`}</Text>
              </Text>
            )}
          </Button>
        )
      })

      const nav = [
        key('j', 'down', () => cursorTo($, i => i + 1)),
        key('k', 'up', () => cursorTo($, i => i - 1)),
        key('g', 'top', () => cursorTo($, () => 0)),
        key('e', 'end', () => cursorTo($, (_, r) => r.length - 1)),
        key('l', 'open', () => {
          const row = allRows[cursor]
          if (row?.kind === 'ticket') void openTicket($, row.t.key)
          else if (row?.kind === 'group') set($, { collapsed: S.collapsed.includes(row.name) ? S.collapsed.filter(n => n !== row.name) : [...S.collapsed, row.name] })
        }),
        key('z', 'fold', () => {
          const row = allRows[cursor]
          if (!row) return
          const name = row.kind === 'group' ? row.name : groupOf(row.t, groupByNow())
          set($, {
            collapsed: S.collapsed.includes(name) ? S.collapsed.filter(n => n !== name) : [...S.collapsed, name],
            selected: `grp:${name}`,
          })
        }),
      ]
      const findKeys = [
        key('f', 'find', () => set($, { prompting: 'search' })),
        ...(S.filter || (S.view === 'search' && S.searchQuery) ? [key('u', 'clear', () => clearSearch($))] : []),
        key('t', `by ${groupByNow()}`, async () => {
          const options = S.project ? GROUP_BYS.filter(g => g !== 'project') : GROUP_BYS
          const next = options[(options.indexOf(groupByNow()) + 1) % options.length]!
          set($, { groupBy: next, collapsed: [] })
          await $.store.set('groupBy', next)
        }),
      ]
      const actKeys = cursorT
        ? [
            key('s', 'status', async () => {
              set($, { mode: 'detail' })
              await openStatusPicker($, cursorT)
            }),
            key('w', 'start work', () => askClaude($, cursorT, 'start')),
            key('y', 'copy key', () => $.ui.copy({ text: cursorT.key })),
            key('o', 'browser', () => openInBrowser($, cursorT.url)),
          ]
        : []
      const projKeys = [
        key('p', 'project', async () => {
          set($, { prompting: 'project', projectFilter: '', projectCursor: 0 })
          await loadProjects($)
          const at = S.projects.findIndex(x => x.id === S.project?.id)
          set($, { projectCursor: at + 1 })
        }),
        key('n', 'next', () => stepProject($, 1)),
        key('b', 'prev', () => stepProject($, -1)),
      ]
      const misc = [key('r', 'refresh', () => refresh($)), key('q', 'quit', () => $.ui.close({ id: source.pane }))]

      const list = (
        <Box flexDirection="column" width={isWide ? listWidth : undefined}>
          {S.view !== 'search' && scopeTickets().length === 0 && !S.isLoading && (
            <Text dimColor>{S.project ? `No open tickets in ${S.project.name}.` : 'Nothing loaded yet. Press r.'}</Text>
          )}
          {S.view === 'search' && !S.searchQuery && <Text dimColor>Press f to search. {source.searchHelp}</Text>}
          {(S.view !== 'search' ? scopeTickets().length > 0 : S.searchQuery !== '') && allRows.length === 0 && !S.isSearching && (
            <Text dimColor>{S.filter ? `Nothing in ${current.label} matches "${S.filter}".` : `Nothing in ${current.label}.`}</Text>
          )}
          {start > 0 && <Text dimColor>  ↑ {start} more</Text>}
          {windowed.map(row => {
            const id = rowId(row)
            const isCursor = cursorRow !== undefined && id === rowId(cursorRow)
            const bar = <Text color={isCursor ? 'claude' : 'promptBorder'}>{isCursor ? '▌' : ' '}</Text>
            if (row.kind === 'group') {
              const isFolded = S.collapsed.includes(row.name)
              return (
                <Button key={id} plain onPress={() => set($, {
                  selected: id,
                  collapsed: isFolded ? S.collapsed.filter(n => n !== row.name) : [...S.collapsed, row.name],
                })}>
                  {bar}
                  <Text color="claude">{isFolded ? ' ▸ ' : ' ▾ '}</Text>
                  <Text bold color="claude">{clip(row.name, listWidth - 14)}</Text>
                  <Text dimColor>{` ${row.count} `}</Text>
                  <Text color="promptBorder">{'┄'.repeat(Math.max(2, listWidth - Math.min(row.name.length, listWidth - 14) - String(row.count).length - 9))}</Text>
                </Button>
              )
            }
            const x = row.t
            const p = priorityMark(x.priority)
            const who = x.isAssignedToMe ? '' : x.assignee ? ` @${x.assignee.split(' ')[0]}` : ' unassigned'
            const statusText = clip(x.status, 12).padEnd(12)
            const room = Math.max(8, listWidth - x.key.length - who.length - 26)
            return (
              <Button key={id} plain onPress={() => {
                if (S.selected === id) void openTicket($, id)
                else {
                  set($, { selected: id })
                  void loadDetail($, id)
                }
              }}>
                {bar}
                <Text color={p.color}>{` ${p.text}`}</Text>
                <Text color={STATUS_COLOR[x.statusType]}>{` ${statusText}`}</Text>
                <Text dimColor>{` ${x.key}`}</Text>
                <Text bold={isCursor} inverse={isCursor}>{` ${clip(x.title, room)} `}</Text>
                {who ? <Text color="suggestion">{who}</Text> : ''}
                <Text dimColor>{` ${ago(x.updatedAt, now)}`}</Text>
              </Button>
            )
          })}
          {start + listRoom < allRows.length && <Text dimColor>  ↓ {allRows.length - start - listRoom} more</Text>}
        </Box>
      )

      const previewWidth = isWide ? width - listWidth - 5 : width - 4
      const previewRoom = isWide ? height - 8 : Math.max(6, height - listRoom - 12)
      const preview = cursorT && (() => {
        const d = details.get(cursorT.key) ?? null
        const comments = d ? [...d.comments].sort((a, b) => b.at.localeCompare(a.at)) : []
        const peek = comments.slice(0, isWide ? 3 : 2)
        return (
          <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="promptBorder" paddingX={1}>
            {header(els, cursorT, previewWidth, now)}
            {rule(els, previewWidth, 'description')}
            {d === null ? (
              <Text dimColor>Loading…</Text>
            ) : d.description.trim() ? (
              <Markdown text={bodyOf(cleanMarkdown(d.description), Math.max(3, previewRoom - 8 - peek.length * 5)).text} />
            ) : (
              <Text dimColor>No description.</Text>
            )}
            {comments.length > 0 && rule(els, previewWidth, `${comments.length} comment${comments.length === 1 ? '' : 's'} · newest · l reads all`)}
            {peek.map((c, i) => commentCard(els, c, { key: `peek-${i}`, now, lines: 3, isExpanded: false }))}
          </Box>
        )
      })()

      return (
        <Box flexDirection="column">
          <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
            {chip(els, `◆ ${source.name}`, 'claude')}
            <Button key="project-chip" plain onPress={() => void (async () => {
              set($, { prompting: 'project', projectFilter: '', projectCursor: 0 })
              await loadProjects($)
            })()}>
              {S.project ? (
                <Text backgroundColor="suggestion" color="inverseText" bold>{` ▸ ${clip(S.project.name, 30)} `}</Text>
              ) : (
                <Text color="subtle" bold>{' ▸ My work '}</Text>
              )}
            </Button>
            {tabs}
          </Box>
          {statusLine}
          {srcBlockedTools().length > 0 && (
            <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
              <Text color="warning">Background checks are paused. These reads need to be allowed so they can run without a prompt:</Text>
              {srcBlockedTools().map(t => (
                <Text dimColor>{`  ${t}`}</Text>
              ))}
              <Button key="allow-reads" hotkey="x" label="ask Claude to allow them" onPress={() =>
                void $.prompt.submit({
                  text: `Add these tools to permissions.allow in ~/.claude/settings.json so the ${source.name} viewer mod can check tickets in the background without a prompt. They are read-only connector tools: ${srcBlockedTools().join(', ')}`,
                })
              } />
            </Box>
          )}
          {rule(els, width)}
          {isWide ? (
            <Box flexDirection="row" columnGap={1}>
              {list}
              {preview}
            </Box>
          ) : (
            <Box flexDirection="column">
              {list}
              {preview}
            </Box>
          )}
          {rule(els, width)}
          {keyBar([nav, findKeys, projKeys, actKeys, misc])}
        </Box>
      )
    })
  }
}
