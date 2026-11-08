import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { GroupBy, Pr, Prompting, PrEvent, Snapshot, Status, TimelineItem, View } from '../types'
import {
  DETAIL_QUERY,
  firstLine,
  LIST_QUERY,
  mergeLists,
  SEARCH_QUERY,
  searchQueryOf,
  searchResultsOf,
  toTimeline,
} from './github'
import type { ListData } from './github'
import {
  ago,
  badge,
  changesOf,
  ciMark,
  clip,
  groupOf,
  isRemoteQuery,
  matchesFilter,
  rowId,
  rowsOf,
  shortRef,
  snapshotOf,
  ticketOf,
  UNGROUPED,
  VIEWS,
} from './model'
import type { Row } from './model'

const prsA = atom({ plugin: 'pr-organizer', key: 'prs' } as const, [], { shape: 'prs-2' })
const viewA = atom({ plugin: 'pr-organizer', key: 'view' } as const, 'open')
const groupByA = atom({ plugin: 'pr-organizer', key: 'groupBy' } as const, 'group')
const modeA = atom({ plugin: 'pr-organizer', key: 'mode' } as const, 'list')
const selectedA = atom({ plugin: 'pr-organizer', key: 'selected' } as const, null)
const groupsA = atom({ plugin: 'pr-organizer', key: 'groups' } as const, {})
const collapsedA = atom({ plugin: 'pr-organizer', key: 'collapsed' } as const, [])
const statusA = atom({ plugin: 'pr-organizer', key: 'status' } as const, null)
const loadingA = atom({ plugin: 'pr-organizer', key: 'isLoading' } as const, false)
const confirmA = atom({ plugin: 'pr-organizer', key: 'confirm' } as const, null)
const promptingA = atom({ plugin: 'pr-organizer', key: 'prompting' } as const, null)
const fetchedAtA = atom({ plugin: 'pr-organizer', key: 'fetchedAt' } as const, 0)
const scopeA = atom({ plugin: 'pr-organizer', key: 'scope' } as const, '')
const detailA = atom({ plugin: 'pr-organizer', key: 'detail' } as const, null, {
  shape: 'detail-1',
})
const detailOffsetA = atom({ plugin: 'pr-organizer', key: 'detailOffset' } as const, 0)
const eventsA = atom({ plugin: 'pr-organizer', key: 'events' } as const, [], {
  shape: 'events-1',
})
const pollMinutesA = atom({ plugin: 'pr-organizer', key: 'pollMinutes' } as const, 3)
const filterA = atom({ plugin: 'pr-organizer', key: 'filter' } as const, '')
const searchQueryA = atom({ plugin: 'pr-organizer', key: 'searchQuery' } as const, '')
const searchResultsA = atom({ plugin: 'pr-organizer', key: 'searchResults' } as const, [], {
  shape: 'search-1',
})
const searchingA = atom({ plugin: 'pr-organizer', key: 'isSearching' } as const, false)

type Dollar = EngineInterface

const PANE = 'pr-organizer'
const GROUP_BYS: GroupBy[] = ['group', 'repo', 'none']
const MODEL_TOOLS = 'mcp__pr-organizer__list_prs, mcp__pr-organizer__search_prs and mcp__pr-organizer__set_pr_group'

let pollTimer: Timer | undefined

async function setStatus($: Dollar, status: Status) {
  await update($, statusA, () => status)
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function pushEvents($: Dollar, found: { url: string; kind: PrEvent['kind']; text: string }[]) {
  if (found.length === 0) return
  const now = await $.clock.now()
  const fresh: PrEvent[] = found.map((f, i) => ({ ...f, id: `${now}-${i}`, at: now }))
  await update($, eventsA, list => {
    const replaced = list.filter(e => !fresh.some(f => f.url === e.url && f.kind === e.kind))
    return [...fresh, ...replaced].slice(0, 30)
  })
  if (fresh.length > 3) {
    $.ui.toast(`${fresh.length} PR updates. Press ctrl+x tab, then o to open the newest.`, {
      timeoutMs: 8000,
    })
    return
  }
  for (const f of fresh) $.ui.toast(f.text, { timeoutMs: 8000 })
}

async function refresh($: Dollar, opts: { quiet?: boolean } = {}): Promise<string | null> {
  if (!opts.quiet) await update($, loadingA, () => true)
  try {
    const scope = (await read($, scopeA)).trim()
    const q = (s: string) => (scope ? `${s} ${scope}` : s)
    const ran = await $.process.run(
      [
        'gh', 'api', 'graphql',
        '-f', `query=${LIST_QUERY}`,
        '-f', `mine=${q('is:pr is:open author:@me archived:false sort:updated-desc')}`,
        '-f', `merged=${q('is:pr is:merged author:@me sort:updated-desc')}`,
        '-f', `review=${q('is:pr is:open review-requested:@me archived:false sort:updated-desc')}`,
      ],
      { timeoutMs: 60_000 },
    )
    if (ran.exitCode !== 0) {
      const err = `gh failed: ${firstLine(ran.stderr || ran.stdout)}`
      await setStatus($, { text: err, isError: true })
      return err
    }
    const data = JSON.parse(ran.stdout).data as ListData
    const list = mergeLists(data)
    const before = (await $.store.get('snapshot')) as Snapshot | undefined
    if (before) await pushEvents($, changesOf(before, list, data.viewer.login))
    await $.store.set('snapshot', snapshotOf(list))
    await update($, prsA, () => list)
    await update($, fetchedAtA, () => Date.now())
    if (!opts.quiet) {
      await setStatus($, null)
      await ensureCursor($)
    }
    return null
  } catch (err) {
    const msg = `Could not load PRs: ${errorText(err)}`
    if (!opts.quiet) await setStatus($, { text: msg, isError: true })
    return msg
  } finally {
    if (!opts.quiet) await update($, loadingA, () => false)
  }
}

const detailCache = new Map<string, TimelineItem[]>()

async function fetchDetail($: Dollar, url: string, opts: { force?: boolean } = {}) {
  const cached = detailCache.get(url)
  if (cached && !opts.force) {
    await update($, detailA, () => ({ url, items: cached }))
    return
  }
  await update($, detailA, d => (d?.url === url ? d : null))
  try {
    const ran = await $.process.run(
      ['gh', 'api', 'graphql', '-f', `query=${DETAIL_QUERY}`, '-f', `url=${url}`],
      { timeoutMs: 60_000 },
    )
    if (ran.exitCode !== 0) {
      await setStatus($, { text: `Comments: ${firstLine(ran.stderr || ran.stdout)}`, isError: true })
      return
    }
    const node = JSON.parse(ran.stdout).data?.resource
    if (!node) return
    const items = toTimeline(node)
    detailCache.set(url, items)
    if ((await read($, selectedA)) === url) await update($, detailA, () => ({ url, items }))
  } catch (err) {
    await setStatus($, { text: `Comments: ${errorText(err)}`, isError: true })
  }
}

async function gh($: Dollar, doing: string, argv: string[]) {
  await update($, confirmA, () => null)
  await update($, promptingA, () => null)
  await setStatus($, { text: `${doing}…`, isError: false })
  try {
    const ran = await $.process.run(['gh', ...argv], { timeoutMs: 120_000 })
    if (ran.exitCode !== 0) {
      await setStatus($, {
        text: `${doing} failed: ${firstLine(ran.stderr || ran.stdout)}`,
        isError: true,
      })
      return
    }
    await refresh($, { quiet: true })
    const query = await read($, searchQueryA)
    if (query) await searchGithub($, query, { quiet: true })
    const selected = await read($, selectedA)
    if (selected) await fetchDetail($, selected, { force: true })
    await setStatus($, { text: `${doing}: done`, isError: false })
  } catch (err) {
    await setStatus($, { text: `${doing} failed: ${errorText(err)}`, isError: true })
  }
}

async function setGroup($: Dollar, urls: string[], group: string) {
  const name = group.trim()
  const next = await update($, groupsA, groups => {
    const copy = { ...groups }
    for (const url of urls) {
      if (name) copy[url] = name
      else delete copy[url]
    }
    return copy
  })
  await $.store.set('groups', next)
}

async function openInBrowser($: Dollar, url: string) {
  for (const opener of ['open', 'xdg-open']) {
    try {
      const ran = await $.process.run([opener, url], { timeoutMs: 10_000 })
      if (ran.exitCode === 0) return
    } catch {}
  }
  await setStatus($, { text: `Could not open a browser for ${url}`, isError: true })
}

async function dismissEventsFor($: Dollar, url: string) {
  await update($, eventsA, list => list.filter(e => e.url !== url))
}

async function openPr($: Dollar, url: string) {
  await update($, selectedA, () => url)
  await update($, modeA, () => 'detail')
  await update($, detailOffsetA, () => 0)
  await update($, confirmA, () => null)
  await update($, promptingA, () => null)
  await dismissEventsFor($, url)
  await fetchDetail($, url)
}

function shownPrs(
  view: View,
  prs: Pr[],
  results: Pr[],
  filter: string,
  groups: Record<string, string>,
): Pr[] {
  const current = VIEWS.find(v => v.value === view) ?? VIEWS[0]!
  const source = view === 'search' ? results : prs.filter(current.test)
  return source.filter(p => matchesFilter(p, filter, groups))
}

async function visibleRows($: Dollar): Promise<Row[]> {
  const groups = await read($, groupsA)
  const list = shownPrs(
    await read($, viewA),
    await read($, prsA),
    await read($, searchResultsA),
    await read($, filterA),
    groups,
  )
  return rowsOf(list, await read($, groupByA), groups, await read($, collapsedA))
}

async function searchGithub(
  $: Dollar,
  text: string,
  opts: { quiet?: boolean } = {},
): Promise<{ error: string } | { results: Pr[] }> {
  const query = searchQueryOf(text, await read($, scopeA))
  if (!opts.quiet) await update($, searchingA, () => true)
  try {
    const ran = await $.process.run(
      ['gh', 'api', 'graphql', '-f', `query=${SEARCH_QUERY}`, '-f', `q=${query}`],
      { timeoutMs: 60_000 },
    )
    if (ran.exitCode !== 0) {
      const error = `Search failed: ${firstLine(ran.stderr || ran.stdout)}`
      if (!opts.quiet) await setStatus($, { text: error, isError: true })
      return { error }
    }
    const results = searchResultsOf(JSON.parse(ran.stdout).data)
    await update($, searchResultsA, () => results)
    await update($, searchQueryA, () => text)
    return { results }
  } catch (err) {
    const error = `Search failed: ${errorText(err)}`
    if (!opts.quiet) await setStatus($, { text: error, isError: true })
    return { error }
  } finally {
    if (!opts.quiet) await update($, searchingA, () => false)
  }
}

async function applySearch($: Dollar, text: string) {
  await update($, promptingA, () => null)
  const trimmed = text.trim()
  const view = await read($, viewA)
  if (!trimmed) {
    await clearSearch($)
    return
  }
  if (view === 'search' || isRemoteQuery(trimmed)) {
    await update($, filterA, () => '')
    await update($, viewA, () => 'search')
    await update($, searchQueryA, () => trimmed)
    await update($, selectedA, () => null)
    const found = await searchGithub($, trimmed)
    if ('results' in found) await setStatus($, null)
  } else {
    await update($, filterA, () => trimmed)
    await update($, selectedA, () => null)
  }
  await moveCursor($, firstPr)
}

async function clearSearch($: Dollar) {
  await update($, filterA, () => '')
  if ((await read($, viewA)) === 'search') {
    await update($, searchQueryA, () => '')
    await update($, searchResultsA, () => [])
  }
  await update($, selectedA, () => null)
  await moveCursor($, firstPr)
}

const firstPr = (_: number, rows: Row[]) => Math.max(0, rows.findIndex(r => r.kind === 'pr'))

async function ensureCursor($: Dollar) {
  const rows = await visibleRows($)
  const selected = await read($, selectedA)
  const row = rows.find(r => rowId(r) === selected) ?? rows[firstPr(0, rows)]
  if (!row) return
  await update($, selectedA, () => rowId(row))
  if (row.kind === 'pr') await fetchDetail($, row.pr.url).catch(() => {})
}

async function moveCursor($: Dollar, to: (index: number, rows: Row[]) => number) {
  const rows = await visibleRows($)
  if (rows.length === 0) return
  const selected = await read($, selectedA)
  const at = Math.max(-1, rows.findIndex(r => rowId(r) === selected))
  const index = Math.min(rows.length - 1, Math.max(0, to(at, rows)))
  const row = rows[index]
  if (!row) return
  await update($, selectedA, () => rowId(row))
  await update($, confirmA, () => null)
  if (row.kind === 'pr') fetchDetail($, row.pr.url).catch(() => {})
}

async function stepPr($: Dollar, delta: 1 | -1) {
  const rows = (await visibleRows($)).filter(r => r.kind === 'pr')
  if (rows.length === 0) return
  const selected = await read($, selectedA)
  const at = rows.findIndex(r => rowId(r) === selected)
  const row = rows[(at + delta + rows.length) % rows.length]
  if (row) await openPr($, rowId(row))
}

async function toggleFold($: Dollar, name: string) {
  await update($, collapsedA, c => (c.includes(name) ? c.filter(n => n !== name) : [...c, name]))
}

async function selectedRow($: Dollar): Promise<Row | null> {
  const selected = await read($, selectedA)
  return (await visibleRows($)).find(r => rowId(r) === selected) ?? null
}

function askClaude($: Dollar, pr: Pr) {
  const isFailing = pr.ci === 'FAILURE' || pr.ci === 'ERROR'
  const text =
    pr.isReviewRequested && !pr.isMine
      ? `Review this pull request and tell me anything I should flag before approving: ${pr.url}`
      : pr.isMine && (pr.review === 'CHANGES_REQUESTED' || isFailing)
        ? `My PR ${pr.url} (branch ${pr.headRef}) has ${pr.review === 'CHANGES_REQUESTED' ? 'requested changes' : 'failing CI'}. Read the review comments and failing checks, and help me fix them.`
        : `Summarize the current state of ${pr.url}: what is left before it can merge, and what reviewers said.`
  void $.prompt.submit({ text })
}

async function confirmOr($: Dollar, action: string, url: string, run: () => Promise<void>) {
  const tag = `${action}:${url}`
  if ((await read($, confirmA)) === tag) {
    await run()
    return
  }
  await update($, confirmA, () => tag)
}

function startPolling($: Dollar, minutes: number) {
  pollTimer?.cancel()
  pollTimer = undefined
  if (minutes <= 0) return
  pollTimer = $.clock.every(minutes * 60_000, () => {
    void (async () => {
      if (await read($, loadingA)) return
      await refresh($, { quiet: true })
    })()
  })
}

async function openPane($: Dollar) {
  await $.ui.open({ id: PANE, title: 'PRs', focus: true })
}

function itemHeader(item: TimelineItem, now: number): string {
  const when = item.at ? `${ago(item.at, now)} ago` : ''
  switch (item.kind) {
    case 'description':
      return `${item.author} · description`
    case 'review':
      return `${item.author} · ${(item.state ?? 'reviewed').toLowerCase().replace('_', ' ')} · ${when}`
    case 'thread':
      return `${item.author} · ${item.path}${item.line ? `:${item.line}` : ''}${item.isResolved ? ' · resolved' : ''} · ${when}`
    default:
      return `${item.author} · ${when}`
  }
}

function clipBody(body: string, lines: number): string {
  const all = body.trim().split('\n')
  return all.length <= lines ? all.join('\n') : `${all.slice(0, lines).join('\n')}\n…`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prs',
      description:
        'Open the PR organizer (args: refresh | search <query> | author <login> | scope <qualifiers> | poll <minutes|off>)',
      argumentHint: '[refresh | search <query> | author <login> | scope org:acme | poll 5]',
    })
    await $.tool.register({
      name: 'list_prs',
      description:
        "List the user's GitHub PRs (their open and recently merged ones, and ones awaiting their review) as JSON, with the group each one is in. Pass refresh=true to re-fetch from GitHub first.",
      inputSchema: { type: 'object', properties: { refresh: { type: 'boolean' } } },
    })
    await $.tool.register({
      name: 'search_prs',
      description:
        'Search GitHub pull requests with GitHub search syntax (author:login, repo:owner/name, org:acme, label:x, is:open, is:merged, review-requested:login, free text). Returns JSON. Use it for PRs that are not the user\'s own.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' }, showInPane: { type: 'boolean' } },
        required: ['query'],
      },
    })
    await $.tool.register({
      name: 'set_pr_group',
      description:
        'Put PRs into a named group of related work in the PR organizer (e.g. "PROJ-12 auth rewrite"). An empty group name removes the manual grouping so the PR falls back to its ticket key.',
      inputSchema: {
        type: 'object',
        properties: {
          urls: { type: 'array', items: { type: 'string' }, description: 'PR URLs' },
          group: { type: 'string' },
        },
        required: ['urls', 'group'],
      },
    })

    const storedGroups = await $.store.get('groups')
    if (storedGroups && typeof storedGroups === 'object') {
      await update($, groupsA, () => storedGroups as Record<string, string>)
    }
    const storedScope = await $.store.get('scope')
    if (typeof storedScope === 'string') await update($, scopeA, () => storedScope)
    const storedPoll = await $.store.get('pollMinutes')
    if (typeof storedPoll === 'number') await update($, pollMinutesA, () => storedPoll)

    const minutes = await read($, pollMinutesA)
    startPolling($, minutes)
    if (minutes > 0) $.clock.after(5_000, () => void refresh($, { quiet: true }))

    return next(e)
  })

  on('command.run', { command: 'prs' }, async ($, e) => {
    const [sub, ...rest] = e.args.trim().split(/\s+/)
    if (sub === 'scope') {
      const scope = rest.join(' ')
      await update($, scopeA, () => scope)
      await $.store.set('scope', scope)
      const err = await refresh($)
      return { text: err ?? (scope ? `PR search scope set to: ${scope}` : 'PR search scope cleared.') }
    }
    if (sub === 'poll') {
      const arg = rest[0] ?? ''
      const minutes = arg === 'off' ? 0 : Number(arg)
      if (!Number.isFinite(minutes) || minutes < 0) {
        return { text: 'Usage: /prs poll <minutes> or /prs poll off' }
      }
      await update($, pollMinutesA, () => minutes)
      await $.store.set('pollMinutes', minutes)
      startPolling($, minutes)
      return {
        text: minutes > 0 ? `Checking PRs every ${minutes} min.` : 'Background PR checks are off.',
      }
    }
    if (sub === 'search' || sub === 'author') {
      const words = rest.join(' ').trim()
      if (!words) return { text: `Usage: /prs ${sub} <${sub === 'author' ? 'login' : 'query'}>` }
      const text = sub === 'author' ? `author:${words.replace(/^@/, '')} is:open` : words
      await openPane($)
      await update($, modeA, () => 'list')
      await update($, viewA, () => 'search')
      await applySearch($, text)
      const count = (await read($, searchResultsA)).length
      return { text: `${count} PR(s) for: ${text}` }
    }
    await openPane($)
    await ensureCursor($)
    if (sub === 'refresh') {
      const err = await refresh($)
      return { text: err ?? 'PR organizer opened and refreshed.' }
    }
    const isStale = Date.now() - (await read($, fetchedAtA)) > 5 * 60_000
    if (isStale) void refresh($)
    return { text: 'PR organizer opened.' }
  })

  on('tool.call', { tool: 'mcp__pr-organizer__list_prs' }, async ($, e) => {
    const args = e as unknown as { refresh?: boolean }
    if (args.refresh || (await read($, prsA)).length === 0) {
      const err = await refresh($)
      if (err) return { deny: err }
    }
    const groups = await read($, groupsA)
    const list = (await read($, prsA)).map(p => ({
      url: p.url,
      repo: p.repo,
      title: p.title,
      branch: p.headRef,
      state: p.isDraft ? 'DRAFT' : p.state,
      review: p.review,
      ci: p.ci,
      author: p.author,
      mine: p.isMine,
      reviewRequestedOfMe: p.isReviewRequested,
      labels: p.labels,
      ticket: ticketOf(p),
      manualGroup: groups[p.url] ?? null,
    }))
    return { result: JSON.stringify(list, null, 1) }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'pr-organizer: listing PRs failed.' }))

  on('tool.call', { tool: 'mcp__pr-organizer__search_prs' }, async ($, e) => {
    const args = e as unknown as { query?: unknown; showInPane?: unknown }
    const query = typeof args.query === 'string' ? args.query.trim() : ''
    if (!query) return { deny: 'query must be a non-empty GitHub search string' }
    const found = await searchGithub($, query, { quiet: args.showInPane !== true })
    if ('error' in found) return { deny: found.error }
    if (args.showInPane === true) {
      await update($, viewA, () => 'search')
      await update($, modeA, () => 'list')
      await openPane($)
    }
    const list = found.results.map(p => ({
      url: p.url,
      repo: p.repo,
      title: p.title,
      author: p.author,
      branch: p.headRef,
      state: p.isDraft ? 'DRAFT' : p.state,
      review: p.review,
      ci: p.ci,
      updatedAt: p.updatedAt,
      labels: p.labels,
    }))
    return { result: JSON.stringify(list, null, 1) }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'pr-organizer: search failed.' }))

  on('tool.call', { tool: 'mcp__pr-organizer__set_pr_group' }, async ($, e) => {
    const args = e as unknown as { urls?: unknown; group?: unknown }
    const urls = Array.isArray(args.urls)
      ? args.urls.filter((u): u is string => typeof u === 'string')
      : []
    const group = typeof args.group === 'string' ? args.group : ''
    if (urls.length === 0) return { deny: 'urls must be a non-empty array of PR URLs' }
    await setGroup($, urls, group)
    return {
      result: group.trim()
        ? `Put ${urls.length} PR(s) in group "${group.trim()}".`
        : `Cleared the manual group of ${urls.length} PR(s).`,
    }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'pr-organizer: setting the group failed.' },
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const events = await read($, eventsA)
    const top = events[0]
    if (e.props.hasSurvey || !top) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const pr = (await read($, prsA)).find(p => p.url === top.url)
    const confirm = await read($, confirmA)
    const canMerge =
      pr !== undefined && pr.isMine && pr.state === 'OPEN' && pr.review === 'APPROVED'
    const isConfirming = confirm === `band-merge:${top.url}`
    const width = Math.max(20, e.props.bodyColumns - 40)

    return (
      <Box flexDirection="row" columnGap={1} flexWrap="wrap">
        <Text color={top.kind === 'ci-failed' || top.kind === 'changes' ? 'error' : 'success'}>
          PR
        </Text>
        <Text>{clip(top.text, width)}</Text>
        {events.length > 1 && <Text dimColor>+{events.length - 1}</Text>}
        <Button
          key="band-open"
          hotkey="o"
          label="open"
          onPress={() =>
            void (async () => {
              await openPane($)
              await openPr($, top.url)
            })()
          }
        />
        {canMerge && (
          <Button
            key="band-merge"
            hotkey="m"
            variant={isConfirming ? 'primary' : undefined}
            label={isConfirming ? 'confirm merge' : 'merge'}
            onPress={() =>
              void confirmOr($, 'band-merge', top.url, async () => {
                await gh($, `Merge ${shortRef(pr)}`, ['pr', 'merge', top.url, '--squash', '--delete-branch'])
                await dismissEventsFor($, top.url)
                const status = await read($, statusA)
                if (status) $.ui.toast(status.text)
              })
            }
          />
        )}
        <Button key="band-dismiss" hotkey="d" label="dismiss" onPress={() => void update($, eventsA, l => l.slice(1))} />
        {events.length > 1 && (
          <Button key="band-clear" hotkey="x" label="clear all" onPress={() => void update($, eventsA, () => [])} />
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input, Link, Markdown } = $.ui.resolve(e)
    const width = Math.max(30, e.props.bodyColumns)
    const height = Math.max(12, e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 30)
    const now = Date.now()

    const prs = await read($, prsA)
    const view = await read($, viewA)
    const groupBy = await read($, groupByA)
    const mode = await read($, modeA)
    const selected = await read($, selectedA)
    const groups = await read($, groupsA)
    const collapsed = await read($, collapsedA)
    const status = await read($, statusA)
    const isLoading = await read($, loadingA)
    const confirm = await read($, confirmA)
    const prompting = await read($, promptingA)
    const fetchedAt = await read($, fetchedAtA)
    const scope = await read($, scopeA)
    const detail = await read($, detailA)
    const detailOffset = await read($, detailOffsetA)
    const pollMinutes = await read($, pollMinutesA)
    const filter = await read($, filterA)
    const searchQuery = await read($, searchQueryA)
    const searchResults = await read($, searchResultsA)
    const isSearching = await read($, searchingA)

    const current = VIEWS.find(v => v.value === view) ?? VIEWS[0]!
    const rows = rowsOf(shownPrs(view, prs, searchResults, filter, groups), groupBy, groups, collapsed)
    const pr = prs.find(p => p.url === selected) ?? searchResults.find(p => p.url === selected) ?? null
    const rule = <Text dimColor>{'─'.repeat(Math.max(10, width - 1))}</Text>
    const isAsking = (action: string) => pr !== null && confirm === `${action}:${pr.url}`

    const key = (k: string, label: string, run: () => unknown, color?: string) => (
      <Button key={`key-${k}`} plain hotkey={k} onPress={() => void run()}>
        {color ? <Text color={color} bold>{label}</Text> : label}
      </Button>
    )

    const statusLine = (
      <Box flexDirection="row" columnGap={1}>
        {(isLoading || isSearching) && <Text color="warning">{isSearching ? 'searching…' : 'loading…'}</Text>}
        {status && <Text color={status.isError ? 'error' : 'subtle'}>{clip(status.text, width - 12)}</Text>}
        {!isLoading && !isSearching && !status && (
          <Text dimColor>
            {fetchedAt ? `updated ${ago(new Date(fetchedAt).toISOString(), now)} ago` : 'not loaded'}
            {pollMinutes > 0 ? ` · checks every ${pollMinutes}m` : ' · background checks off'}
            {scope ? ` · ${scope}` : ''}
          </Text>
        )}
      </Box>
    )

    if (prompting === 'search') {
      const isGithub = view === 'search'
      return (
        <Box flexDirection="column">
          <Text bold>{isGithub ? 'Search GitHub' : `Find in ${current.label}`}</Text>
          <Text dimColor>
            {isGithub
              ? 'GitHub search syntax: author:pat repo:acme/api label:bug is:merged, plus free text.'
              : 'Words filter this view by title, repo, branch, author, ticket, group and labels. A qualifier like author:pat searches GitHub instead.'}
          </Text>
          <Input
            key="input-search"
            label="/"
            value={isGithub ? searchQuery : filter}
            placeholder={isGithub ? 'author:pat is:open' : 'login, TICKETA-1, author:pat'}
            submitLabel="search"
            autoFocus
            onSubmit={v => void applySearch($, v)}
          />
          <Button key="input-cancel" label="Cancel" onPress={() => void update($, promptingA, () => null)} />
        </Box>
      )
    }

    if (prompting && pr) {
      const fields: Record<Exclude<Prompting, null | 'search'>, { label: string; placeholder: string; submit: (v: string) => void }> = {
        comment: {
          label: 'Comment',
          placeholder: 'Write a comment, Enter to post',
          submit: v => {
            if (v.trim()) void gh($, 'Comment', ['pr', 'comment', pr.url, '--body', v])
          },
        },
        reviewers: {
          label: 'Reviewers',
          placeholder: 'login1,login2 or org/team',
          submit: v => {
            const who = v.split(/[\s,]+/).filter(Boolean).join(',')
            if (who) void gh($, 'Request review', ['pr', 'edit', pr.url, '--add-reviewer', who])
          },
        },
        group: {
          label: 'Group',
          placeholder: groups[pr.url] ?? ticketOf(pr) ?? 'e.g. PROJ-12 or auth rewrite',
          submit: v => {
            void setGroup($, [pr.url], v)
            void update($, promptingA, () => null)
          },
        },
      }
      const field = fields[prompting]
      return (
        <Box flexDirection="column">
          <Text bold>{clip(`${shortRef(pr)} ${pr.title}`, width)}</Text>
          <Input
            key={`input-${prompting}`}
            label={field.label}
            placeholder={field.placeholder}
            rows={prompting === 'comment' ? 4 : 1}
            autoFocus
            onSubmit={v => field.submit(v)}
          />
          <Button key="input-cancel" label="Cancel" onPress={() => void update($, promptingA, () => null)} />
        </Box>
      )
    }

    if (mode === 'detail' && pr) {
      const b = badge(pr)
      const ci = ciMark(pr)
      const isOpen = pr.state === 'OPEN'
      const all = detail?.url === pr.url ? detail.items : null
      const description = all?.find(i => i.kind === 'description') ?? null
      const items = all?.filter(i => i.kind !== 'description') ?? null
      const perItem = 8
      const room = Math.max(1, Math.floor((height - 12) / perItem))
      const offset = Math.min(detailOffset, Math.max(0, (items?.length ?? 1) - 1))
      const shown = items?.slice(offset, offset + room) ?? []

      const actions = [
        key('h', 'back', () => update($, modeA, () => 'list')),
        key('j', 'down', () => update($, detailOffsetA, o => Math.min(o + 1, Math.max(0, (items?.length ?? 1) - 1)))),
        key('k', 'up', () => update($, detailOffsetA, o => Math.max(0, o - 1))),
        key('g', 'top', () => update($, detailOffsetA, () => 0)),
        key('n', 'next PR', () => stepPr($, 1)),
        key('p', 'prev PR', () => stepPr($, -1)),
        key('o', 'browser', () => openInBrowser($, pr.url)),
        key('c', 'comment', () => update($, promptingA, () => 'comment')),
      ]
      if (isOpen && pr.isMine) {
        actions.push(
          key('m', isAsking('merge') ? 'm again to merge' : 'merge', () =>
            confirmOr($, 'merge', pr.url, () => gh($, 'Merge', ['pr', 'merge', pr.url, '--squash', '--delete-branch'])),
            isAsking('merge') ? 'warning' : undefined,
          ),
          key('w', 'auto-merge', () => gh($, 'Auto-merge', ['pr', 'merge', pr.url, '--auto', '--squash'])),
          pr.isDraft
            ? key('y', 'ready', () => gh($, 'Mark ready', ['pr', 'ready', pr.url]))
            : key('y', 'to draft', () => gh($, 'Convert to draft', ['pr', 'ready', pr.url, '--undo'])),
          key('b', 'update branch', () => gh($, 'Update branch', ['pr', 'update-branch', pr.url])),
          key('v', 'reviewers', () => update($, promptingA, () => 'reviewers')),
          key('x', isAsking('close') ? 'x again to close' : 'close', () =>
            confirmOr($, 'close', pr.url, () => gh($, 'Close', ['pr', 'close', pr.url])),
            isAsking('close') ? 'warning' : undefined,
          ),
        )
      }
      if (isOpen && pr.isReviewRequested) {
        actions.push(
          key('a', isAsking('approve') ? 'a again to approve' : 'approve', () =>
            confirmOr($, 'approve', pr.url, () => gh($, 'Approve', ['pr', 'review', pr.url, '--approve'])),
            isAsking('approve') ? 'warning' : undefined,
          ),
        )
      }
      actions.push(
        key('s', 'set group', () => update($, promptingA, () => 'group')),
        key('i', 'ask Claude', () => askClaude($, pr)),
        key('r', 'refresh', async () => {
          await refresh($)
          await fetchDetail($, pr.url, { force: true })
        }),
        key('q', 'quit', () => $.ui.close({ id: PANE })),
      )

      return (
        <Box flexDirection="column">
          <Text bold color="claude">{clip(pr.title, width)}</Text>
          <Box flexDirection="row" columnGap={1}>
            <Link href={pr.url} label={`${pr.repo}#${pr.number}`} />
            <Text color={b.color}>{b.text}</Text>
            <Text color={ci.color}>CI {(pr.ci ?? 'none').toLowerCase()}</Text>
            {pr.mergeable === 'CONFLICTING' && <Text color="error">conflicts</Text>}
          </Box>
          <Text dimColor>
            {clip(`${pr.headRef} → ${pr.baseRef} · by ${pr.author} · ${ago(pr.updatedAt, now)} ago · group ${groups[pr.url] ?? ticketOf(pr) ?? UNGROUPED}`, width)}
          </Text>
          {pr.reviewers.length > 0 && <Text dimColor>{clip(`waiting on: ${pr.reviewers.join(', ')}`, width)}</Text>}
          {statusLine}
          <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
            {actions}
          </Box>
          {rule}
          {description && offset === 0 && (
            <Box flexDirection="column" marginBottom={1}>
              <Markdown text={clipBody(description.body, 10)} />
            </Box>
          )}
          <Text dimColor>
            {items === null
              ? 'Loading comments…'
              : items.length === 0
                ? 'No comments yet.'
                : `Conversation, newest first · ${offset + 1}-${Math.min(items.length, offset + room)} of ${items.length}`}
          </Text>
          {shown.map((item, i) => (
            <Box key={`item-${offset + i}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
              <Text color={item.state === 'APPROVED' ? 'success' : item.state === 'CHANGES_REQUESTED' ? 'error' : 'claude'}>
                {clip(itemHeader(item, now), width - 4)}
              </Text>
              {item.body.trim() !== '' && <Markdown text={clipBody(item.body, perItem - 3)} />}
              {(item.replies ?? []).map(r => (
                <Text dimColor>{clip(`↳ ${r.author}: ${firstLine(r.body)}`, width - 4)}</Text>
              ))}
            </Box>
          ))}
          {items !== null && offset + room < items.length && (
            <Text dimColor>↓ {items.length - offset - room} more (j)</Text>
          )}
        </Box>
      )
    }

    const listRoom = Math.max(4, Math.min(rows.length, Math.floor((height - 8) * 0.55)))
    const cursor = Math.max(0, rows.findIndex(r => rowId(r) === selected))
    const start = Math.min(Math.max(0, cursor - Math.floor(listRoom / 2)), Math.max(0, rows.length - listRoom))
    const windowed = rows.slice(start, start + listRoom)
    const cursorRow = rows[cursor]
    const cursorPr = cursorRow?.kind === 'pr' ? cursorRow.pr : null

    const previewRoom = Math.max(4, height - listRoom - 12)
    const previewOf = (url: string) => {
      if (detail?.url !== url) return <Text dimColor>Loading description and comments…</Text>
      const desc = detail.items.find(i => i.kind === 'description')
      const talk = detail.items.filter(i => i.kind !== 'description')
      const descLines = Math.max(2, previewRoom - Math.min(3, talk.length) * 2 - 1)
      return (
        <Box flexDirection="column">
          {desc ? <Markdown text={clipBody(desc.body, descLines)} /> : <Text dimColor>No description.</Text>}
          {talk.length > 0 && (
            <Text dimColor>
              {talk.length} comment{talk.length === 1 ? '' : 's'}, newest first · l to read all
            </Text>
          )}
          {talk.slice(0, 3).map((item, i) => (
            <Text key={`peek-${i}`}>
              <Text color={item.state === 'APPROVED' ? 'success' : item.state === 'CHANGES_REQUESTED' ? 'error' : 'suggestion'}>
                {clip(itemHeader(item, now), Math.floor(width / 2))}
              </Text>
              <Text dimColor>{clip(` ${firstLine(item.body)}`, Math.max(10, width - Math.floor(width / 2) - 2))}</Text>
            </Text>
          ))}
        </Box>
      )
    }

    const tabs = VIEWS.map((v, i) => {
      const count = v.value === 'search' ? searchResults.length : prs.filter(v.test).length
      const isOn = v.value === view
      return (
        <Button
          key={`view-${v.value}`}
          plain
          hotkey={String(i + 1)}
          onPress={() =>
            void (async () => {
              await update($, viewA, () => v.value as View)
              await update($, selectedA, () => null)
              await moveCursor($, firstPr)
            })()
          }
        >
          <Text bold={isOn} inverse={isOn}>{` ${v.label} ${count} `}</Text>
        </Button>
      )
    })

    const listKeys = [
      key('j', 'down', () => moveCursor($, i => i + 1)),
      key('k', 'up', () => moveCursor($, i => i - 1)),
      key('g', 'top', () => moveCursor($, () => 0)),
      key('e', 'end', () => moveCursor($, (_, r) => r.length - 1)),
      key('l', 'open', async () => {
        const row = await selectedRow($)
        if (row?.kind === 'pr') await openPr($, row.pr.url)
        else if (row?.kind === 'group') await toggleFold($, row.name)
      }),
      key('z', 'fold', async () => {
        const row = await selectedRow($)
        if (row?.kind === 'group') {
          await toggleFold($, row.name)
          return
        }
        if (row?.kind !== 'pr') return
        const owner = groupOf(row.pr, groupBy, groups)
        await toggleFold($, owner)
        await update($, selectedA, () => `grp:${owner}`)
      }),
      key('t', groupBy === 'group' ? 'by ticket' : groupBy === 'repo' ? 'by repo' : 'no groups', () =>
        update($, groupByA, g => GROUP_BYS[(GROUP_BYS.indexOf(g) + 1) % GROUP_BYS.length]!),
      ),
      key('f', 'find', () => update($, promptingA, () => 'search')),
    ]
    if (filter || (view === 'search' && searchQuery)) {
      listKeys.push(key('u', 'clear search', () => clearSearch($)))
    }
    if (cursorPr) {
      const p = cursorPr
      listKeys.push(key('o', 'browser', () => openInBrowser($, p.url)))
      if (p.isMine && p.state === 'OPEN' && p.review === 'APPROVED') {
        listKeys.push(
          key('m', isAsking('merge') ? 'm again to merge' : 'merge', () =>
            confirmOr($, 'merge', p.url, () => gh($, 'Merge', ['pr', 'merge', p.url, '--squash', '--delete-branch'])),
            isAsking('merge') ? 'warning' : undefined,
          ),
        )
      }
      if (p.isReviewRequested && p.state === 'OPEN') {
        listKeys.push(
          key('a', isAsking('approve') ? 'a again to approve' : 'approve', () =>
            confirmOr($, 'approve', p.url, () => gh($, 'Approve', ['pr', 'review', p.url, '--approve'])),
            isAsking('approve') ? 'warning' : undefined,
          ),
        )
      }
      listKeys.push(key('i', 'ask Claude', () => askClaude($, p)))
    }
    listKeys.push(
      key('c', 'Claude groups', () =>
        $.prompt.submit({
          text: `Group my pull requests by related work. Use ${MODEL_TOOLS}: list them, work out which ones belong to the same piece of work (shared ticket keys, branch names, titles, repos that change together), and put each cluster in a short descriptive group. Leave PRs that already sit in a sensible ticket group alone. Tell me the groups you made.`,
        }),
      ),
      key('r', 'refresh', () => refresh($)),
      key('q', 'quit', () => $.ui.close({ id: PANE })),
    )

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap">
          {tabs}
        </Box>
        {statusLine}
        {(filter || (view === 'search' && searchQuery)) && (
          <Text>
            <Text color="suggestion">/ </Text>
            {view === 'search' ? searchQuery : filter}
            <Text dimColor> · u clears</Text>
          </Text>
        )}
        {rule}
        {view !== 'search' && prs.length === 0 && !isLoading && <Text dimColor>No PRs loaded yet. Press r.</Text>}
        {view === 'search' && !searchQuery && (
          <Text dimColor>Press f and search GitHub, e.g. author:pat is:open or repo:acme/api label:bug.</Text>
        )}
        {(view !== 'search' ? prs.length > 0 : searchQuery !== '') && rows.length === 0 && !isSearching && (
          <Text dimColor>{filter ? `Nothing in ${current.label} matches "${filter}".` : `Nothing in ${current.label}.`}</Text>
        )}
        {start > 0 && <Text dimColor>↑ {start} more</Text>}
        {windowed.map(row => {
          const id = rowId(row)
          const isCursor = id === rowId(cursorRow ?? row) && cursorRow !== undefined
          if (row.kind === 'group') {
            const isFolded = collapsed.includes(row.name)
            return (
              <Button key={id} plain onPress={() => void (async () => {
                await update($, selectedA, () => id)
                await toggleFold($, row.name)
              })()}>
                <Text inverse={isCursor}>{isFolded ? '▸ ' : '▾ '}</Text>
                <Text bold color="claude">{row.name}</Text>
                <Text dimColor> ({row.count})</Text>
              </Button>
            )
          }
          const p = row.pr
          const b = badge(p)
          const ci = ciMark(p)
          const ref = shortRef(p)
          const who = p.isMine ? '' : `@${p.author}`
          const titleRoom = Math.max(10, width - ref.length - b.text.length - who.length - 12)
          return (
            <Button key={id} plain onPress={() => void (async () => {
              if (selected === id) await openPr($, id)
              else await update($, selectedA, () => id)
            })()}>
              {isCursor ? '› ' : '  '}
              <Text color={ci.color}>{ci.text}</Text>{' '}
              <Text color={b.color}>{b.text}</Text>{' '}
              <Text dimColor>{ref}</Text>{' '}
              <Text inverse={isCursor} bold={isCursor}>{clip(p.title, titleRoom)}</Text>
              {who ? <Text color="suggestion"> {who}</Text> : ''}
            </Button>
          )
        })}
        {start + listRoom < rows.length && <Text dimColor>↓ {rows.length - start - listRoom} more</Text>}
        {cursorPr && rule}
        {cursorPr && (
          <Box flexDirection="column">
            <Text bold color="claude">{clip(cursorPr.title, width)}</Text>
            <Box flexDirection="row" columnGap={1}>
              <Text color={badge(cursorPr).color}>{badge(cursorPr).text}</Text>
              <Text color={ciMark(cursorPr).color}>CI {(cursorPr.ci ?? 'none').toLowerCase()}</Text>
              {cursorPr.mergeable === 'CONFLICTING' && <Text color="error">conflicts</Text>}
              <Text dimColor>
                {clip(`${cursorPr.headRef} → ${cursorPr.baseRef} · @${cursorPr.author} · ${ago(cursorPr.updatedAt, now)} ago${cursorPr.reviewers.length ? ` · waiting on ${cursorPr.reviewers.join(', ')}` : ''}`, Math.max(20, width - 30))}
              </Text>
            </Box>
            {previewOf(cursorPr.url)}
          </Box>
        )}
        {rule}
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          {listKeys}
        </Box>
      </Box>
    )
  })
}
