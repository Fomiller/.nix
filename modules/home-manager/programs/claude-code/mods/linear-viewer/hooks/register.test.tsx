import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { filterOf } from './source'

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

const ME = { id: 'u-me', displayName: 'forrest' }

function issue(n: number, title: string, extra: Record<string, unknown> = {}) {
  return {
    id: `i-${n}`,
    identifier: `FOM-${n}`,
    title,
    url: `https://linear.app/fomiller/issue/FOM-${n}`,
    priority: 2,
    priorityLabel: 'High',
    estimate: null,
    branchName: `forrest/fom-${n}`,
    updatedAt: `2026-11-0${n % 9 || 1}T00:00:00Z`,
    state: { id: 's-todo', name: 'Todo', type: 'unstarted' },
    team: { key: 'FOM', name: 'Fomiller' },
    project: { name: 'Homelab' },
    cycle: null,
    parent: null,
    labels: { nodes: [] },
    assignee: ME,
    creator: { id: 'u-me' },
    comments: { nodes: [] },
    ...extra,
  }
}

type Call = { query: string; variables: Record<string, unknown> }

function engine(on: On, env: Record<string, string>, nodes: () => unknown[]) {
  const calls: Call[] = []
  const toasts: string[] = []
  mock.store(on)
  mock.env(on, env)
  mock.clock(on, { now: Date.parse('2026-11-08T00:00:00Z') })
  on('command.register', () => ({ value: { command: 'linear' } }))
  on('tool.register', (_, e) => ({ value: { tool: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.list', () => ({ value: [] }))
  on('http.fetch', (_, e) => {
    const call = JSON.parse(e.init?.body ?? '{}') as Call
    calls.push(call)
    let data: unknown = {}
    if (call.query.includes('assignedIssues')) data = { viewer: { id: ME.id, assignedIssues: { nodes: nodes() }, createdIssues: { nodes: [] } } }
    else if (call.query.includes('issues(first')) data = { viewer: { id: ME.id }, issues: { nodes: [issue(40, 'pat owns this', { assignee: { id: 'u-pat', displayName: 'Pat' } })] } }
    else if (call.query.includes('description')) data = { issue: { description: '## Plan\n\n- step one', comments: { nodes: [{ body: 'Looks good', createdAt: '2026-11-07T00:00:00Z', user: { displayName: 'Pat' } }] } } }
    else if (call.query.includes('states')) data = { issue: { team: { states: { nodes: [
      { id: 's-todo', name: 'Todo', type: 'unstarted', position: 1 },
      { id: 's-prog', name: 'In Progress', type: 'started', position: 2 },
      { id: 's-done', name: 'Done', type: 'completed', position: 3 },
    ] } } } }
    else if (call.query.includes('viewer { id displayName }')) data = { viewer: ME }
    else if (call.query.includes('mutation')) data = { ok: { success: true } }
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ data }) } }
  })
  return { calls, toasts }
}

const run = (args: string) => ({ command: 'linear', args }) as never

test('without a key the pane explains the setup', async ($, on) => {
  engine(on, {}, () => [])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const out = await $.command.run(run(''))
  expect(out.text).toContain('LINEAR_API_KEY')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Markdown', text: /Personal API keys/ })).toBeTruthy()
  await ui.unmount()
})

test('lists, previews, opens and moves a ticket', async ($, on) => {
  const { calls } = engine(on, { LINEAR_API_KEY: 'lin_api_x' }, () => [issue(1, 'Set up attic'), issue(2, 'Fix nvim clone', { project: { name: 'Dotfiles' } })])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(run('refresh'))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Button', key: 'grp:Homelab' })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'grp:Dotfiles' })).toBeTruthy()
    expect(await ui.find({ type: 'Markdown', text: /step one/ })).toBeTruthy()

    await ui.press({ key: 'key-g' })
    await ui.press({ key: 'key-j' })
    expect((await ui.find({ type: 'Button', key: 'FOM-2' }))?.text).toContain('▌')
    await ui.press({ key: 'key-l' })
    expect(await ui.find({ type: 'Markdown', text: /Looks good/ })).toBeTruthy()

    calls.length = 0
    await ui.press({ key: 'key-s' })
    await ui.press({ key: 'status-s-prog' })
    const mutation = calls.find(c => c.query.includes('issueUpdate'))
    expect(mutation?.variables).toEqual({ id: 'i-2', stateId: 's-prog' })

    await ui.press({ key: 'key-h' })
    await ui.unmount()
  }
})

test('qualifiers search Linear and words filter the view', async ($, on) => {
  const { calls } = engine(on, { LINEAR_API_KEY: 'lin_api_x' }, () => [issue(1, 'Set up attic'), issue(2, 'Fix nvim clone')])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(run('refresh'))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'key-f' })
  await ui.input({ key: 'input-search', text: 'nvim' })
  expect(await ui.find({ type: 'Button', key: 'FOM-2' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'FOM-1' })).toBeFalsy()
  await ui.press({ key: 'key-u' })

  await ui.press({ key: 'key-f' })
  await ui.input({ key: 'input-search', text: 'assignee:pat is:open' })
  const q = calls.find(c => c.query.includes('issues(first'))
  expect(q?.variables.filter).toEqual({
    and: [
      { assignee: { displayName: { containsIgnoreCase: 'pat' } } },
      { state: { type: { nin: ['completed', 'canceled'] } } },
    ],
  })
  expect((await ui.find({ type: 'Button', key: 'FOM-40' }))?.text).toContain('@Pat')
  await ui.unmount()
})

test('a status change and a new comment found in the background toast', async ($, on) => {
  let state = { id: 's-todo', name: 'Todo', type: 'unstarted' }
  let comments: unknown[] = []
  const { toasts } = engine(on, { LINEAR_API_KEY: 'lin_api_x' }, () => [issue(1, 'Set up attic', { state, comments: { nodes: comments } })])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(run('refresh'))
  expect(toasts.length).toBe(0)

  state = { id: 's-prog', name: 'In Progress', type: 'started' }
  comments = [{ createdAt: '2026-11-08T01:00:00Z', user: { id: 'u-pat', displayName: 'Pat' } }]
  await $.command.run(run('refresh'))
  expect(toasts).toContain('Todo → In Progress: FOM-1 Set up attic')
  expect(toasts).toContain('Pat commented: FOM-1 Set up attic')
})

test('filterOf builds Linear filters', () => {
  expect(filterOf('team:FOM label:bug')).toEqual({
    and: [{ team: { key: { eqIgnoreCase: 'FOM' } } }, { labels: { name: { eqIgnoreCase: 'bug' } } }],
  })
  expect(filterOf('assignee:me')).toEqual({ assignee: { isMe: { eq: true } } })
  expect(filterOf('status:"In Review" attic')).toEqual({
    and: [
      { state: { name: { eqIgnoreCase: 'In Review' } } },
      { or: [{ title: { containsIgnoreCase: 'attic' } }, { description: { containsIgnoreCase: 'attic' } }] },
    ],
  })
})
