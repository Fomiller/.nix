import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { mcpArgsOf } from './source'

const PANE = {
  plugin: 'linear-viewer',
  component: 'Pane',
  requestId: 'linear-viewer',
  props: {
    title: 'Linear',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const ME = '133e5608-ceda-47e7-91c2-508acaec1050'
const P = 'mcp__claude_ai_Linear__'

function issue(n: number, title: string, extra: Record<string, unknown> = {}) {
  return {
    id: `FOM-${n}`,
    uuid: `uuid-${n}`,
    title,
    url: `https://linear.app/fomiller/issue/FOM-${n}`,
    gitBranchName: `forrestmillerj/fom-${n}`,
    priority: { value: 2, name: 'High' },
    estimate: null,
    updatedAt: `2026-11-0${n % 9 || 1}T00:00:00.000Z`,
    completedAt: null,
    status: 'Todo',
    statusType: 'unstarted',
    labels: [],
    assignee: 'Forrest Miller',
    assigneeId: ME,
    createdById: ME,
    project: 'Homelab',
    team: 'Fomiller',
    parentId: null,
    ...extra,
  }
}

const clockRef: { c: ReturnType<typeof mock.clock> | null } = { c: null }

const saved = { text: '', paths: [] as string[] }

type Call = { tool: string; args: Record<string, unknown> }

function engine(on: On, issues: () => unknown[], comments: () => unknown[] = () => [], oversized = false) {
  const calls: Call[] = []
  const http: string[] = []
  const toasts: string[] = []
  mock.store(on)
  mock.env(on, {})
  clockRef.c = mock.clock(on, { now: Date.parse('2026-11-08T00:00:00Z') })
  on('command.register', () => ({ value: { command: 'linear' } }))
  on('tool.register', (_, e) => ({ value: { tool: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('http.fetch', (_, e) => {
    http.push(e.url)
    return { value: { status: 500, ok: false, headers: {}, text: '' } }
  })
  on('fs.read', (_, e) => {
    saved.paths.push(e.path)
    return { value: saved.text }
  })
  on('tool.list', () => ({
    value: ['list_issues', 'get_issue', 'list_comments', 'list_issue_statuses', 'save_issue', 'save_comment', 'whoami'].map(n => ({ name: `${P}${n}` })) as never,
  }))
  on('tool.call', (_, e) => {
    const { tool, tool_use_id: _id, ...args } = e as unknown as { tool: string; tool_use_id?: string } & Record<string, unknown>
    calls.push({ tool, args })
    const name = tool.replace(P, '')
    let out: unknown = { ok: true }
    if (name === 'whoami') out = { user: { id: ME, name: 'Forrest Miller', displayName: 'forrestmillerj' } }
    else if (name === 'list_issues') {
      out = { issues: args.creator === 'me' ? [] : issues(), hasNextPage: false }
      if (oversized && args.state === 'started') {
        saved.text = JSON.stringify([{ type: 'text', text: JSON.stringify(out) }])
        const text = 'Error: result (100,919 characters across 1 line) exceeds maximum allowed tokens. Output has been saved to /Users/forrest/.claude/projects/x/tool-results/mcp-list_issues-1.txt.'
        return { result: [{ type: 'text', text }], text } as never
      }
    }
    else if (name === 'get_issue') out = { id: args.id, description: 'Built from <issue id="x" label="FOM-269" href="https://linear.app/fomiller/issue/FOM-269" />.' }
    else if (name === 'list_comments') out = { comments: comments(), hasNextPage: false }
    else if (name === 'list_issue_statuses') out = [
      { id: 'st-review', type: 'started', name: 'In Review' },
      { id: 'st-prog', type: 'started', name: 'In Progress' },
      { id: 'st-todo', type: 'unstarted', name: 'Todo' },
      { id: 'st-done', type: 'completed', name: 'Done' },
    ]
    const text = JSON.stringify(out)
    return { result: [{ type: 'text', text }], text } as never
  })
  return { calls, http, toasts }
}

const run = (args: string) => ({ command: 'linear', args }) as never

test('with a connector and no key it uses the connector', async ($, on) => {
  const { calls, http } = engine(on, () => [issue(1, 'Set up attic'), issue(2, 'Fix nvim clone', { status: 'In Review', statusType: 'started' })], () => [
    { body: 'Looks good', createdAt: '2026-11-07T00:00:00.000Z', author: { name: 'Pat' } },
  ])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await $.command.run(run('refresh'))).text).toBe('Linear viewer opened.')
  expect(http.length).toBe(0)
  expect(calls.find(c => c.tool.endsWith('list_issues'))?.args).toMatchObject({ assignee: 'me' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /via connector/ })).toBeTruthy()
  await ui.press({ key: 'view-review' })
  expect(await ui.find({ type: 'Button', key: 'FOM-2' })).toBeTruthy()
  await ui.press({ key: 'key-l' })
  expect(await ui.find({ type: 'Markdown', text: /\[FOM-269\]\(https:\/\/linear.app\/fomiller\/issue\/FOM-269\)/ })).toBeTruthy()
  expect(await ui.find({ type: 'Markdown', text: /Looks good/ })).toBeTruthy()

  calls.length = 0
  await ui.press({ key: 'key-s' })
  await ui.press({ key: 'status-st-prog' })
  expect(calls.find(c => c.tool.endsWith('save_issue'))?.args).toEqual({ id: 'FOM-2', state: 'st-prog' })

  calls.length = 0
  await ui.press({ key: 'key-c' })
  await ui.input({ key: 'input-comment', text: 'On it' })
  expect(calls.find(c => c.tool.endsWith('save_comment'))?.args).toEqual({ issueId: 'FOM-2', body: 'On it' })
  await ui.unmount()
})

test('background checks never prompt: they pause and name the reads to allow', async ($, on) => {
  on('tool.check', () => ({ decision: 'ask', reason: 'needs a person' }))
  const { calls } = engine(on, () => [issue(1, 'Set up attic')])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clockRef.c!.advance(9_000)
  expect(calls.length).toBe(0)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Background checks are paused/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /mcp__claude_ai_Linear__whoami/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'allow-reads' })).toBeTruthy()
  await ui.unmount()
})

test('background checks run once the reads are allowed', async ($, on) => {
  on('tool.check', (_, e) => ({ decision: /__(list_|get_|whoami)/.test(e.tool) ? 'allow' : 'ask' }))
  const { calls } = engine(on, () => [issue(1, 'Set up attic')])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clockRef.c!.advance(9_000)
  expect(calls.some(c => c.tool.endsWith('list_issues'))).toBe(true)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Background checks are paused/ })).toBeFalsy()
  expect(await ui.find({ type: 'Button', key: 'FOM-1' })).toBeTruthy()
  await ui.unmount()
})

test('a comment found in the background toasts in connector mode', async ($, on) => {
  let updated = '2026-11-01T00:00:00.000Z'
  let comments: unknown[] = []
  const { toasts } = engine(on, () => [issue(1, 'Set up attic', { updatedAt: updated })], () => comments)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(run('refresh'))
  updated = '2026-11-08T01:00:00.000Z'
  comments = [{ body: 'ping', createdAt: '2026-11-08T01:00:00.000Z', author: { name: 'Pat' } }]
  await $.command.run(run('refresh'))
  expect(toasts).toContain('Pat commented: FOM-1 Set up attic')
})

test('qualifiers map onto the connector arguments', () => {
  expect(mcpArgsOf('assignee:pat team:FOM label:bug attic')).toEqual({ assignee: 'pat', team: 'FOM', label: 'bug', query: 'attic' })
  expect(mcpArgsOf('status:"In Review" cycle:current')).toEqual({ state: 'In Review', cycle: 'current' })
})

test('a result too big for one MCP answer is read from the file Claude Code saved', async ($, on) => {
  const { calls } = engine(on, () => [issue(7, 'Big one', { status: 'In Progress', statusType: 'started' })], () => [], true)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await $.command.run(run('refresh'))).text).toBe('Linear viewer opened.')
  expect(saved.paths).toContain('/Users/forrest/.claude/projects/x/tool-results/mcp-list_issues-1.txt')
  expect(calls.filter(c => c.tool.endsWith('list_issues')).every(c => c.args.limit === 50)).toBe(true)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Button', key: 'FOM-7' })).toBeTruthy()
  await ui.unmount()
})
