import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GroupBy, Pr, Prompting, Status, View } from '../types'

const PANE = 'pr-organizer'
const UNGROUPED = 'Ungrouped'

const prsA = atom({ plugin: 'pr-organizer', key: 'prs' } as const, [], {
  shape: 'prs-1',
})
const viewA = atom({ plugin: 'pr-organizer', key: 'view' } as const, 'open')
const groupByA = atom(
  { plugin: 'pr-organizer', key: 'groupBy' } as const,
  'group',
)
const selectedA = atom({ plugin: 'pr-organizer', key: 'selected' } as const, null)
const groupsA = atom({ plugin: 'pr-organizer', key: 'groups' } as const, {})
const collapsedA = atom({ plugin: 'pr-organizer', key: 'collapsed' } as const, [])
const statusA = atom({ plugin: 'pr-organizer', key: 'status' } as const, null)
const loadingA = atom({ plugin: 'pr-organizer', key: 'isLoading' } as const, false)
const confirmA = atom({ plugin: 'pr-organizer', key: 'confirm' } as const, null)
const promptingA = atom(
  { plugin: 'pr-organizer', key: 'prompting' } as const,
  null,
)
const fetchedAtA = atom({ plugin: 'pr-organizer', key: 'fetchedAt' } as const, 0)
const scopeA = atom({ plugin: 'pr-organizer', key: 'scope' } as const, '')

const VIEWS: { value: View; label: string; test: (p: Pr) => boolean }[] = [
  { value: 'open', label: 'My open', test: p => p.isMine && p.state === 'OPEN' },
  { value: 'draft', label: 'Draft', test: p => p.isMine && p.state === 'OPEN' && p.isDraft },
  {
    value: 'needs-review',
    label: 'Awaiting review',
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
    label: 'Changes requested',
    test: p => p.isMine && p.state === 'OPEN' && p.review === 'CHANGES_REQUESTED',
  },
  {
    value: 'failing',
    label: 'CI failing',
    test: p => p.isMine && p.state === 'OPEN' && (p.ci === 'FAILURE' || p.ci === 'ERROR'),
  },
  {
    value: 'to-review',
    label: 'Review requested of me',
    test: p => p.isReviewRequested && p.state === 'OPEN',
  },
  { value: 'merged', label: 'Recently merged', test: p => p.isMine && p.state === 'MERGED' },
]

const TICKET = /(?:^|[^A-Za-z0-9])([A-Za-z][A-Za-z0-9]{1,9}-\d+)(?![A-Za-z0-9])/

function ticketOf(pr: Pr): string | null {
  const m = TICKET.exec(pr.title) ?? TICKET.exec(pr.headRef)
  return m?.[1] ? m[1].toUpperCase() : null
}

function groupOf(pr: Pr, by: GroupBy, groups: Record<string, string>): string {
  if (by === 'none') return 'All'
  if (by === 'repo') return pr.repo
  return groups[pr.url] ?? ticketOf(pr) ?? UNGROUPED
}

function grouped(list: Pr[], by: GroupBy, groups: Record<string, string>) {
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
  } }`

const QUERY = `query($mine: String!, $merged: String!, $review: String!) {
  mine: search(query: $mine, type: ISSUE, first: 60) { ${PR_FIELDS} }
  merged: search(query: $merged, type: ISSUE, first: 25) { ${PR_FIELDS} }
  review: search(query: $review, type: ISSUE, first: 40) { ${PR_FIELDS} }
}`

type Node = {
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
  author: { login: string } | null
  repository: { nameWithOwner: string }
  labels: { nodes: { name: string }[] }
  reviewRequests: { nodes: { requestedReviewer: { login?: string; name?: string } | null }[] }
  commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] }
}

function toPr(n: Node, isMine: boolean, isReviewRequested: boolean): Pr {
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
  }
}

type Dollar = EngineInterface

function firstLine(text: string): string {
  return text.trim().split('\n')[0]?.slice(0, 300) ?? ''
}

async function setStatus($: Dollar, status: Status) {
  await update($, statusA, () => status)
}

async function refresh($: Dollar): Promise<string | null> {
  await update($, loadingA, () => true)
  try {
    const scope = (await read($, scopeA)).trim()
    const q = (s: string) => (scope ? `${s} ${scope}` : s)
    const ran = await $.process.run(
      [
        'gh', 'api', 'graphql',
        '-f', `query=${QUERY}`,
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
    const data = JSON.parse(ran.stdout).data as Record<'mine' | 'merged' | 'review', { nodes: Node[] }>
    const byUrl = new Map<string, Pr>()
    for (const n of [...data.mine.nodes, ...data.merged.nodes]) {
      if (n?.url) byUrl.set(n.url, toPr(n, true, false))
    }
    for (const n of data.review.nodes) {
      if (!n?.url) continue
      const had = byUrl.get(n.url)
      byUrl.set(n.url, had ? { ...had, isReviewRequested: true } : toPr(n, false, true))
    }
    const list = [...byUrl.values()]
    await update($, prsA, () => list)
    await update($, fetchedAtA, () => Date.now())
    await setStatus($, null)
    return null
  } catch (err) {
    const msg = `Could not load PRs: ${err instanceof Error ? err.message : String(err)}`
    await setStatus($, { text: msg, isError: true })
    return msg
  } finally {
    await update($, loadingA, () => false)
  }
}

async function gh($: Dollar, doing: string, argv: string[]) {
  await update($, confirmA, () => null)
  await update($, promptingA, () => null)
  await setStatus($, { text: `${doing}…`, isError: false })
  try {
    const ran = await $.process.run(['gh', ...argv], { timeoutMs: 120_000 })
    if (ran.exitCode !== 0) {
      await setStatus($, { text: `${doing} failed: ${firstLine(ran.stderr || ran.stdout)}`, isError: true })
      return
    }
    await refresh($)
    await setStatus($, { text: `${doing}: done`, isError: false })
    $.ui.toast(`${doing}: done`)
  } catch (err) {
    await setStatus($, {
      text: `${doing} failed: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    })
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

function clip(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, Math.max(1, width - 1))}…`
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

function badge(pr: Pr): { text: string; color: string } {
  if (pr.state === 'MERGED') return { text: 'merged', color: 'merged' }
  if (pr.state === 'CLOSED') return { text: 'closed', color: 'inactive' }
  if (pr.isDraft) return { text: 'draft', color: 'inactive' }
  if (pr.review === 'APPROVED') return { text: 'approved', color: 'success' }
  if (pr.review === 'CHANGES_REQUESTED') return { text: 'changes', color: 'error' }
  return { text: 'review', color: 'warning' }
}

function ciMark(pr: Pr): { text: string; color: string } {
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

const MODEL_TOOLS = 'mcp__pr-organizer__list_prs and mcp__pr-organizer__set_pr_group'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prs',
      description: 'Open the PR organizer pane (args: refresh | scope <gh search qualifiers>)',
      argumentHint: '[refresh | scope org:acme]',
    })
    await $.tool.register({
      name: 'list_prs',
      description:
        "List the user's GitHub PRs (their open + recently merged ones, and ones awaiting their review) as JSON, with the group each one is currently in. Pass refresh=true to re-fetch from GitHub first.",
      inputSchema: {
        type: 'object',
        properties: { refresh: { type: 'boolean' } },
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
    await $.ui.open({ id: PANE, title: 'PRs', focus: true })
    const isStale = Date.now() - (await read($, fetchedAtA)) > 5 * 60_000
    if (sub === 'refresh') {
      const err = await refresh($)
      return { text: err ?? 'PR organizer opened and refreshed.' }
    }
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

  on('tool.call', { tool: 'mcp__pr-organizer__set_pr_group' }, async ($, e) => {
    const args = e as unknown as { urls?: unknown; group?: unknown }
    const urls = Array.isArray(args.urls) ? args.urls.filter((u): u is string => typeof u === 'string') : []
    const group = typeof args.group === 'string' ? args.group : ''
    if (urls.length === 0) return { deny: 'urls must be a non-empty array of PR URLs' }
    await setGroup($, urls, group)
    return {
      result: group.trim()
        ? `Put ${urls.length} PR(s) in group "${group.trim()}".`
        : `Cleared the manual group of ${urls.length} PR(s).`,
    }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'pr-organizer: setting the group failed.' }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Select, Input, Link } = $.ui.resolve(e)
    const width = Math.max(30, e.props.bodyColumns)

    const prs = await read($, prsA)
    const view = await read($, viewA)
    const groupBy = await read($, groupByA)
    const selected = await read($, selectedA)
    const groups = await read($, groupsA)
    const collapsed = await read($, collapsedA)
    const status = await read($, statusA)
    const isLoading = await read($, loadingA)
    const confirm = await read($, confirmA)
    const prompting = await read($, promptingA)
    const fetchedAt = await read($, fetchedAtA)
    const scope = await read($, scopeA)

    const current = VIEWS.find(v => v.value === view) ?? VIEWS[0]!
    const shown = prs.filter(current.test)
    const sections = grouped(shown, groupBy, groups)
    const pr = prs.find(p => p.url === selected) ?? null

    const ask = (action: string, url: string) => update($, confirmA, () => `${action}:${url}`)
    const isAsking = (action: string) => pr !== null && confirm === `${action}:${pr.url}`

    const header = (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Select
            key="view"
            label="View"
            value={view}
            options={VIEWS.map(v => ({
              value: v.value,
              label: `${v.label} (${prs.filter(v.test).length})`,
            }))}
            onSelect={value => update($, viewA, () => value as View)}
          />
          <Text> </Text>
          <Select
            key="groupBy"
            label="Group"
            value={groupBy}
            options={[
              { value: 'group', label: 'by ticket / group' },
              { value: 'repo', label: 'by repo' },
              { value: 'none', label: 'none' },
            ]}
            onSelect={value => update($, groupByA, () => value as GroupBy)}
          />
        </Box>
        <Box flexDirection="row">
          <Button key="refresh" hotkey="r" label={isLoading ? 'Loading…' : 'Refresh'} onPress={() => void refresh($)} />
          <Text> </Text>
          <Button
            key="auto-group"
            hotkey="g"
            label="Ask Claude to group"
            onPress={() =>
              void $.prompt.submit({
                text: `Group my pull requests by related work. Use ${MODEL_TOOLS}: list them, work out which ones belong to the same piece of work (shared ticket keys, branch names, titles, repos that change together), and put each cluster in a short descriptive group. Leave PRs that already sit in a sensible ticket group alone. Tell me the groups you made.`,
              })
            }
          />
          <Text dimColor>
            {' '}
            {fetchedAt ? `updated ${ago(new Date(fetchedAt).toISOString())} ago` : 'not loaded'}
            {scope ? ` · scope: ${scope}` : ''}
          </Text>
        </Box>
        {status && <Text color={status.isError ? 'error' : 'subtle'}>{clip(status.text, width)}</Text>}
      </Box>
    )

    const list = (
      <Box flexDirection="column">
        {prs.length === 0 && !isLoading && <Text dimColor>No PRs loaded yet — press Refresh (r).</Text>}
        {prs.length > 0 && shown.length === 0 && <Text dimColor>Nothing in “{current.label}”.</Text>}
        {sections.map(section => {
          const isCollapsed = collapsed.includes(section.name)
          return (
            <Box flexDirection="column" key={`sec:${section.name}`}>
              {groupBy !== 'none' && (
                <Button
                  key={`grp:${section.name}`}
                  plain
                  onPress={() =>
                    update($, collapsedA, c =>
                      c.includes(section.name) ? c.filter(n => n !== section.name) : [...c, section.name],
                    )
                  }
                >
                  {isCollapsed ? '▸ ' : '▾ '}
                  <Text bold color="claude">
                    {section.name}
                  </Text>
                  <Text dimColor> ({section.prs.length})</Text>
                </Button>
              )}
              {!isCollapsed &&
                section.prs.map(p => {
                  const b = badge(p)
                  const ci = ciMark(p)
                  const ref = `${p.repo.split('/')[1] ?? p.repo}#${p.number}`
                  const room = width - ref.length - b.text.length - 12
                  return (
                    <Button
                      key={p.url}
                      plain
                      onPress={() => {
                        void update($, selectedA, s => (s === p.url ? null : p.url))
                        void update($, confirmA, () => null)
                        void update($, promptingA, () => null)
                      }}
                    >
                      {p.url === selected ? '› ' : '  '}
                      <Text color={ci.color}>{ci.text}</Text>{' '}
                      <Text color={b.color}>{b.text}</Text>{' '}
                      <Text dimColor>{ref}</Text> {clip(p.title, Math.max(10, room))}
                    </Button>
                  )
                })}
            </Box>
          )
        })}
      </Box>
    )

    let detail = null
    if (pr) {
      const b = badge(pr)
      const manual = groups[pr.url]
      const isOpen = pr.state === 'OPEN'
      const actions = []

      if (isOpen && pr.isMine) {
        actions.push(
          pr.isDraft ? (
            <Button key="ready" hotkey="y" label="Ready for review" onPress={() => void gh($, 'Mark ready', ['pr', 'ready', pr.url])} />
          ) : (
            <Button key="draft" label="Convert to draft" onPress={() => void gh($, 'Convert to draft', ['pr', 'ready', pr.url, '--undo'])} />
          ),
        )
        actions.push(
          isAsking('merge') ? (
            <Button key="merge" hotkey="m" variant="primary" label="Confirm squash-merge" onPress={() => void gh($, 'Merge', ['pr', 'merge', pr.url, '--squash', '--delete-branch'])} />
          ) : (
            <Button key="merge" hotkey="m" label="Merge" onPress={() => void ask('merge', pr.url)} />
          ),
        )
        actions.push(
          <Button key="auto" label="Auto-merge" onPress={() => void gh($, 'Enable auto-merge', ['pr', 'merge', pr.url, '--auto', '--squash'])} />,
        )
        actions.push(
          <Button key="update" label="Update branch" onPress={() => void gh($, 'Update branch', ['pr', 'update-branch', pr.url])} />,
        )
        actions.push(
          <Button key="reviewers" hotkey="v" label="Request review…" onPress={() => void update($, promptingA, () => 'reviewers')} />,
        )
        actions.push(
          isAsking('close') ? (
            <Button key="close" hotkey="x" variant="primary" label="Confirm close" onPress={() => void gh($, 'Close', ['pr', 'close', pr.url])} />
          ) : (
            <Button key="close" hotkey="x" label="Close" onPress={() => void ask('close', pr.url)} />
          ),
        )
      }
      if (isOpen && pr.isReviewRequested) {
        actions.push(
          isAsking('approve') ? (
            <Button key="approve" hotkey="a" variant="primary" label="Confirm approve" onPress={() => void gh($, 'Approve', ['pr', 'review', pr.url, '--approve'])} />
          ) : (
            <Button key="approve" hotkey="a" label="Approve" onPress={() => void ask('approve', pr.url)} />
          ),
        )
        actions.push(
          <Button
            key="claude-review"
            label="Ask Claude to review"
            onPress={() => void $.prompt.submit({ text: `Review this pull request and summarize anything I should flag before approving: ${pr.url}` })}
          />,
        )
      }
      if (isOpen && pr.isMine && (pr.review === 'CHANGES_REQUESTED' || pr.ci === 'FAILURE' || pr.ci === 'ERROR')) {
        actions.push(
          <Button
            key="claude-fix"
            label="Ask Claude to fix"
            onPress={() =>
              void $.prompt.submit({
                text: `My PR ${pr.url} (branch ${pr.headRef}) has ${pr.review === 'CHANGES_REQUESTED' ? 'requested changes' : 'failing CI'}. Look at the review comments / failing checks and help me address them.`,
              })
            }
          />,
        )
      }
      actions.push(<Button key="comment" hotkey="c" label="Comment…" onPress={() => void update($, promptingA, () => 'comment')} />)
      actions.push(<Button key="set-group" hotkey="s" label="Set group…" onPress={() => void update($, promptingA, () => 'group')} />)
      if (manual) {
        actions.push(<Button key="clear-group" label="Clear group" onPress={() => void setGroup($, [pr.url], '')} />)
      }
      if (confirm) {
        actions.push(<Button key="cancel" label="Cancel" onPress={() => void update($, confirmA, () => null)} />)
      }

      const inputs: Record<Exclude<Prompting, null>, { label: string; placeholder: string; submit: (v: string) => void }> = {
        comment: {
          label: 'Comment',
          placeholder: 'Write a comment…',
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
          placeholder: manual ?? ticketOf(pr) ?? 'e.g. PROJ-12 or “auth rewrite”',
          submit: v => {
            void setGroup($, [pr.url], v)
            void update($, promptingA, () => null)
          },
        },
      }
      const field = prompting ? inputs[prompting] : null

      detail = (
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Text bold>{clip(pr.title, width - 4)}</Text>
          <Link href={pr.url} label={clip(`${pr.repo}#${pr.number}`, width - 4)} />
          <Text dimColor>
            {clip(`${pr.headRef} → ${pr.baseRef} · by ${pr.author} · ${ago(pr.updatedAt)} ago`, width - 4)}
          </Text>
          <Text>
            <Text color={b.color}>{b.text}</Text>
            {' · CI '}
            <Text color={ciMark(pr).color}>{(pr.ci ?? 'none').toLowerCase()}</Text>
            {pr.mergeable === 'CONFLICTING' ? <Text color="error"> · conflicts</Text> : ''}
          </Text>
          {pr.reviewers.length > 0 && <Text dimColor>{clip(`reviewers: ${pr.reviewers.join(', ')}`, width - 4)}</Text>}
          {pr.labels.length > 0 && <Text dimColor>{clip(`labels: ${pr.labels.join(', ')}`, width - 4)}</Text>}
          <Text dimColor>
            group: {manual ? `${manual} (manual)` : (ticketOf(pr) ?? UNGROUPED)}
          </Text>
          <Box flexDirection="row" flexWrap="wrap">
            {actions}
          </Box>
          {field && prompting && (
            <Box flexDirection="row">
              <Input
                key={`input:${prompting}`}
                label={field.label}
                placeholder={field.placeholder}
                autoFocus
                onSubmit={v => field.submit(v)}
              />
              <Button key="input-cancel" label="Cancel" onPress={() => void update($, promptingA, () => null)} />
            </Box>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {header}
        <Text> </Text>
        {list}
        {detail && <Text> </Text>}
        {detail}
      </Box>
    )
  })
}
