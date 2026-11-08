import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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

const P = 'mcp__claude_ai_Atlassian__'
const ME = { accountId: 'a-me', displayName: 'Forrest Miller' }
const clockRef: { c: ReturnType<typeof mock.clock> | null } = { c: null }

function issue(n: number, summary: string, fields: Record<string, unknown> = {}) {
  return {
    id: `${10000 + n}`,
    key: `DO-${n}`,
    fields: {
      summary,
      status: { id: '1', name: 'To Do', statusCategory: { key: 'new' } },
      priority: { name: 'Medium' },
      assignee: ME,
      reporter: ME,
      project: { key: 'DO', name: 'SRE' },
      labels: [],
      updated: `2026-11-0${n % 9 || 1}T00:00:00.000+0000`,
      comment: { comments: [], total: 0 },
      ...fields,
    },
  }
}

type Call = { tool: string; args: Record<string, unknown> }

function engine(on: On, env: Record<string, string>, issues: () => unknown[]) {
  const calls: Call[] = []
  const http: string[] = []
  mock.store(on)
  mock.env(on, env)
  clockRef.c = mock.clock(on, { now: Date.parse('2026-11-08T00:00:00Z') })
  on('command.register', () => ({ value: { command: 'jira' } }))
  on('tool.register', (_, e) => ({ value: { tool: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('http.fetch', (_, e) => {
    http.push(e.url)
    return { value: { status: 500, ok: false, headers: {}, text: '' } }
  })
  on('tool.list', () => ({
    value: [
      'getAccessibleAtlassianResources',
      'atlassianUserInfo',
      'searchJiraIssuesUsingJql',
      'getJiraIssue',
      'getTransitionsForJiraIssue',
      'transitionJiraIssue',
      'addCommentToJiraIssue',
      'editJiraIssue',
    ].map(n => ({ name: `${P}${n}` })) as never,
  }))
  on('tool.call', (_, e) => {
    const { tool, tool_use_id: _id, ...args } = e as unknown as { tool: string; tool_use_id?: string } & Record<string, unknown>
    calls.push({ tool, args })
    const name = tool.replace(P, '')
    let out: unknown = {}
    if (name === 'getAccessibleAtlassianResources') {
      out = [
        { id: 'cloud-other', url: 'https://other.atlassian.net', name: 'other', scopes: ['read:confluence'] },
        { id: 'cloud-acme', url: 'https://acme.atlassian.net', name: 'acme', scopes: ['read:jira-work'] },
      ]
    } else if (name === 'atlassianUserInfo') out = { account_id: ME.accountId, name: ME.displayName }
    else if (name === 'searchJiraIssuesUsingJql') out = { issues: issues() }
    else if (name === 'getJiraIssue') {
      out = {
        key: args.issueIdOrKey,
        fields: {
          description: '## Context\n\nAlready Markdown from the connector.',
          comment: { comments: [{ author: { accountId: 'a-pat', displayName: 'Pat Smith' }, created: '2026-11-07T00:00:00.000+0000', body: 'On it' }] },
        },
      }
    } else if (name === 'getTransitionsForJiraIssue') {
      out = { transitions: [{ id: '21', name: 'Start', to: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } }] }
    }
    const text = JSON.stringify(out)
    return { result: [{ type: 'text', text }], text } as never
  })
  return { calls, http }
}

const run = (args: string) => ({ command: 'jira', args }) as never

test('with the Atlassian connector it needs no token, and picks the Jira site', async ($, on) => {
  const { calls, http } = engine(on, {}, () => [issue(1, 'Egress observability')])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await $.command.run(run('refresh'))).text).toBe('Jira viewer opened.')
  expect(http.length).toBe(0)
  const search = calls.find(c => c.tool.endsWith('searchJiraIssuesUsingJql'))
  expect(search?.args.cloudId).toBe('cloud-acme')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /via connector/ })).toBeTruthy()
  await ui.press({ key: 'key-l' })
  expect(await ui.find({ type: 'Markdown', text: /Already Markdown/ })).toBeTruthy()
  expect(await ui.find({ type: 'Markdown', text: /On it/ })).toBeTruthy()

  calls.length = 0
  await ui.press({ key: 'key-s' })
  await ui.press({ key: 'status-21' })
  expect(calls.find(c => c.tool.endsWith('transitionJiraIssue'))?.args).toEqual({ cloudId: 'cloud-acme', issueIdOrKey: 'DO-1', transition: { id: '21' } })

  calls.length = 0
  await ui.press({ key: 'key-c' })
  await ui.input({ key: 'input-comment', text: 'Shipped' })
  expect(calls.find(c => c.tool.endsWith('addCommentToJiraIssue'))?.args).toEqual({ cloudId: 'cloud-acme', issueIdOrKey: 'DO-1', commentBody: 'Shipped' })
  await ui.unmount()
})

test('JIRA_BASE_URL picks the site when the connector reaches several', async ($, on) => {
  const { calls } = engine(on, { JIRA_BASE_URL: 'https://other.atlassian.net' }, () => [])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(run('refresh'))
  expect(calls.find(c => c.tool.endsWith('searchJiraIssuesUsingJql'))?.args.cloudId).toBe('cloud-other')
})

test('background checks pause instead of prompting', async ($, on) => {
  on('tool.check', () => ({ decision: 'ask' }))
  const { calls } = engine(on, {}, () => [issue(1, 'Egress observability')])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clockRef.c!.advance(9_000)
  expect(calls.length).toBe(0)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Background checks are paused/ })).toBeTruthy()
  await ui.unmount()
})
