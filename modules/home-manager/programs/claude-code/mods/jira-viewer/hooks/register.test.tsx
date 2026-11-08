import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { adfToMarkdown, markdownToAdf } from './adf'
import { jqlOf } from './source'

const PANE = {
  plugin: 'jira-viewer',
  component: 'Pane',
  requestId: 'jira-viewer',
  props: {
    title: 'Jira',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const ENV = {
  JIRA_BASE_URL: 'https://acme.atlassian.net/',
  JIRA_EMAIL: 'me@acme.io',
  JIRA_API_TOKEN: 'tok',
}

const ME = { accountId: 'a-me', displayName: 'Forrest Miller' }

const doc = (text: string) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

function issue(n: number, summary: string, fields: Record<string, unknown> = {}) {
  return {
    id: `${10000 + n}`,
    key: `DO-${n}`,
    fields: {
      summary,
      status: { id: '1', name: 'To Do', statusCategory: { key: 'new' } },
      priority: { name: 'High' },
      assignee: ME,
      reporter: ME,
      project: { key: 'DO', name: 'SRE' },
      labels: ['sre-aviation'],
      updated: `2026-11-0${n % 9 || 1}T00:00:00.000+0000`,
      comment: { comments: [], total: 0 },
      issuetype: { name: 'Task' },
      customfield_10020: [{ name: 'SRE Sprint 42', state: 'active' }],
      ...fields,
    },
  }
}

type Req = { url: string; method: string; body: unknown; auth: string }

function engine(on: On, env: Record<string, string>, issues: () => unknown[]) {
  const reqs: Req[] = []
  const toasts: string[] = []
  mock.store(on)
  mock.env(on, env)
  mock.clock(on, { now: Date.parse('2026-11-08T00:00:00Z') })
  on('command.register', () => ({ value: { command: 'jira' } }))
  on('tool.register', (_, e) => ({ value: { tool: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('http.fetch', (_, e) => {
    const body = e.init?.body ? JSON.parse(e.init.body) : undefined
    reqs.push({ url: e.url, method: e.init?.method ?? 'GET', body, auth: e.init?.headers?.authorization ?? '' })
    const path = e.url.replace('https://acme.atlassian.net', '')
    let out: unknown = {}
    if (path === '/rest/api/3/myself') out = ME
    else if (path === '/rest/api/3/search/jql') {
      out = String(body?.jql).startsWith('(assignee = currentUser()')
        ? { issues: issues() }
        : { issues: [issue(77, 'pat ticket', { assignee: { accountId: 'a-pat', displayName: 'Pat Smith' } })] }
    } else if (path.includes('?fields=description,comment')) {
      out = {
        fields: {
          description: {
            type: 'doc',
            version: 1,
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Context' }] },
              { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'egress logs' }] }] }] },
            ],
          },
          comment: { comments: [{ author: { accountId: 'a-pat', displayName: 'Pat Smith' }, created: '2026-11-07T00:00:00.000+0000', body: doc('On it') }] },
        },
      }
    } else if (path.endsWith('/transitions') && (e.init?.method ?? 'GET') === 'GET') {
      out = {
        transitions: [
          { id: '11', name: 'Start', to: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } },
          { id: '21', name: 'Review', to: { name: 'In Review', statusCategory: { key: 'indeterminate' } } },
          { id: '31', name: 'Done', to: { name: 'Done', statusCategory: { key: 'done' } } },
        ],
      }
    }
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(out) } }
  })
  return { reqs, toasts }
}

const run = (args: string) => ({ command: 'jira', args }) as never

test('without credentials the pane explains the setup', async ($, on) => {
  engine(on, {}, () => [])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await $.command.run(run(''))).text).toContain('JIRA_BASE_URL')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Markdown', text: /API tokens/ })).toBeTruthy()
  await ui.unmount()
})

test('lists by sprint, renders ADF as Markdown and transitions a ticket', async ($, on) => {
  const { reqs } = engine(on, ENV, () => [
    issue(1, 'Egress observability', { status: { id: '3', name: 'In Review', statusCategory: { key: 'indeterminate' } } }),
    issue(2, 'Rotate attic token'),
  ])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(run('refresh'))
  expect(reqs[0]?.auth).toBe(`Basic ${btoa('me@acme.io:tok')}`)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'view-review' })
  expect(await ui.find({ type: 'Button', key: 'DO-1' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'DO-2' })).toBeFalsy()
  await ui.press({ key: 'view-mine' })

  await ui.press({ key: 'key-t' })
  await ui.press({ key: 'key-t' })
  expect(await ui.find({ type: 'Button', key: 'grp:SRE Sprint 42' })).toBeTruthy()

  await ui.press({ key: 'key-g' })
  await ui.press({ key: 'key-j' })
  await ui.press({ key: 'key-l' })
  expect(await ui.find({ type: 'Markdown', text: /## Context\n\n- egress logs/ })).toBeTruthy()
  expect(await ui.find({ type: 'Markdown', text: /On it/ })).toBeTruthy()

  reqs.length = 0
  await ui.press({ key: 'key-s' })
  await ui.press({ key: 'status-31' })
  const post = reqs.find(r => r.method === 'POST' && r.url.endsWith('/transitions'))
  expect(post?.body).toEqual({ transition: { id: '31' } })

  reqs.length = 0
  await ui.press({ key: 'key-c' })
  await ui.input({ key: 'input-comment', text: 'Shipped.\n\nSee PR.' })
  const comment = reqs.find(r => r.method === 'POST' && r.url.endsWith('/comment'))
  expect(comment?.body).toEqual({ body: markdownToAdf('Shipped.\n\nSee PR.') })
  await ui.unmount()
})

test('qualifiers become JQL and raw JQL passes through', async ($, on) => {
  const { reqs } = engine(on, ENV, () => [issue(1, 'Egress observability')])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(run('refresh'))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'key-f' })
  await ui.input({ key: 'input-search', text: 'assignee:"Pat Smith" is:open' })
  const q = reqs.filter(r => r.url.endsWith('/search/jql')).pop()
  expect((q?.body as { jql: string }).jql).toBe('assignee = "Pat Smith" AND statusCategory != Done ORDER BY updated DESC')
  expect((await ui.find({ type: 'Button', key: 'DO-77' }))?.text).toContain('@Pat')
  await ui.unmount()

  expect(jqlOf('project = DO AND sprint in openSprints()')).toBe('project = DO AND sprint in openSprints()')
  expect(jqlOf('project:DO sprint:current egress')).toBe('project = "DO" AND sprint in openSprints() AND text ~ "egress" ORDER BY updated DESC')
})

test('a newly assigned ticket toasts', async ($, on) => {
  let list = [issue(1, 'Egress observability')]
  const { toasts } = engine(on, ENV, () => list)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(run('refresh'))
  list = [...list, issue(5, 'Page on attic 401s')]
  await $.command.run(run('refresh'))
  expect(toasts).toContain('Assigned to you: DO-5 Page on attic 401s')
})

test('ADF tables, code and marks convert to Markdown', () => {
  expect(
    adfToMarkdown({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'run ' }, { type: 'text', text: 'just switch', marks: [{ type: 'code' }] }, { type: 'text', text: ' now', marks: [{ type: 'strong' }] }] },
        { type: 'codeBlock', attrs: { language: 'sh' }, content: [{ type: 'text', text: 'ls -la' }] },
        { type: 'table', content: [
          { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Host' }] }] }] },
          { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nimbus' }] }] }] },
        ] },
      ],
    }),
  ).toBe('run `just switch` **now**\n\n```sh\nls -la\n```\n\n| Host |\n| --- |\n| nimbus |')
})
