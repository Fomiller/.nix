import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  plugin: 'pr-organizer',
  component: 'Pane',
  requestId: 'pr-organizer',
  props: {
    title: 'PRs',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const BAND = {
  plugin: 'pr-organizer',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
} as const

const URL1 = 'https://github.com/acme/api/pull/1'

function node(n: number, title: string, branch: string, extra: Record<string, unknown> = {}) {
  return {
    url: `https://github.com/acme/api/pull/${n}`,
    number: n,
    title,
    state: 'OPEN',
    isDraft: false,
    updatedAt: `2026-11-0${n % 9 || 1}T00:00:00Z`,
    headRefName: branch,
    baseRefName: 'main',
    reviewDecision: 'REVIEW_REQUIRED',
    mergeable: 'MERGEABLE',
    author: { login: 'me' },
    repository: { nameWithOwner: 'acme/api' },
    labels: { nodes: [] },
    reviewRequests: { nodes: [] },
    commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
    comments: { totalCount: 0, nodes: [] },
    reviews: { totalCount: 0, nodes: [] },
    ...extra,
  }
}

function listJson(pr1: Record<string, unknown> = {}) {
  return JSON.stringify({
    data: {
      viewer: { login: 'me' },
      mine: {
        nodes: [
          node(1, '[TICKETA-1] add login endpoint', 'ticketa-1-login', pr1),
          node(2, 'login tests', 'feature/TICKETA-1-tests'),
          node(3, 'TICKETB-7 billing export', 'billing', { isDraft: true }),
        ],
      },
      merged: { nodes: [] },
      review: { nodes: [node(9, 'someone else', 'x', { author: { login: 'pat' } })] },
    },
  })
}

const DETAIL = JSON.stringify({
  data: {
    resource: {
      body: 'Adds the login endpoint.',
      createdAt: '2026-11-01T00:00:00Z',
      author: { login: 'me' },
      comments: { nodes: [{ author: { login: 'pat' }, body: 'Looks close.', createdAt: '2026-11-02T00:00:00Z' }] },
      reviews: { nodes: [{ author: { login: 'sam' }, state: 'APPROVED', body: 'Ship it', submittedAt: '2026-11-03T00:00:00Z' }] },
      reviewThreads: {
        nodes: [
          {
            isResolved: false,
            path: 'api/login.go',
            line: 12,
            comments: { nodes: [{ author: { login: 'pat' }, body: 'Handle the error here.', createdAt: '2026-11-02T01:00:00Z' }] },
          },
        ],
      },
    },
  },
})

const SEARCH = JSON.stringify({
  data: {
    viewer: { login: 'me' },
    results: {
      nodes: [
        node(20, 'pat refactors billing', 'pat/billing', { author: { login: 'pat' } }),
        node(21, 'pat fixes login', 'pat/login', {
          author: { login: 'pat' },
          reviewRequests: { nodes: [{ requestedReviewer: { login: 'me' } }] },
        }),
      ],
    },
  },
})

function engine(on: On, list: () => string, store: Record<string, unknown> = {}) {
  const ran: string[][] = []
  const toasts: string[] = []
  mock.store(on, store)
  mock.clock(on, { now: Date.parse('2026-11-08T00:00:00Z') })
  on('command.register', () => ({ value: { command: 'prs' } }))
  on('tool.register', (_, e) => ({ value: { tool: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    const query = e.argv[4] ?? ''
    const stdout = query.includes('$url')
      ? DETAIL
      : query.includes('$q:')
        ? SEARCH
        : e.argv[1] === 'api'
          ? list()
          : ''
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return { ran, toasts }
}

const refreshArgs = { command: 'prs', args: 'refresh' } as never

test('vim keys move the cursor, open the conversation and merge after a confirm', async ($, on) => {
  const { ran } = engine(on, () => listJson({ reviewDecision: 'APPROVED' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(refreshArgs)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect(await ui.find({ type: 'Button', key: 'grp:TICKETA-1' })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'grp:TICKETB-7' })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'https://github.com/acme/api/pull/9' })).toBeFalsy()

    await ui.press({ key: 'key-g' })
    await ui.press({ key: 'key-j' })
    await ui.press({ key: 'key-j' })
    expect((await ui.find({ type: 'Button', key: URL1 }))?.text).toContain('▌')
    await ui.press({ key: 'key-k' })
    expect((await ui.find({ type: 'Button', key: URL1 }))?.text).not.toContain('▌')
    await ui.press({ key: 'key-j' })

    await ui.press({ key: 'key-l' })
    expect(await ui.find({ type: 'Markdown', text: /Adds the login endpoint/ })).toBeTruthy()
    expect(await ui.find({ type: 'Markdown', text: /Ship it/ })).toBeTruthy()
    await ui.press({ key: 'key-j' })
    expect(await ui.find({ type: 'Text', text: /api\/login\.go:12/ })).toBeTruthy()
    await ui.press({ key: 'key-g' })

    ran.length = 0
    await ui.press({ key: 'key-m' })
    expect(ran.length).toBe(0)
    expect((await ui.find({ type: 'Button', key: 'key-m' }))?.text).toContain('again')
    await ui.press({ key: 'key-m' })
    expect(ran[0]).toEqual(['gh', 'pr', 'merge', URL1, '--squash', '--delete-branch'])

    await ui.press({ key: 'key-h' })
    expect(await ui.find({ type: 'Button', key: 'grp:TICKETA-1' })).toBeTruthy()
    await ui.unmount()
  }
})

test('an approval found in the background toasts and offers merge above the prompt', async ($, on) => {
  let review = 'REVIEW_REQUIRED'
  const { ran, toasts } = engine(on, () => listJson({ reviewDecision: review }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>another band</Text>
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(refreshArgs)
  expect(toasts.length).toBe(0)

  review = 'APPROVED'
  await $.command.run(refreshArgs)
  expect(toasts[0]).toContain('Approved, ready to merge: api#1')

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /Approved/ })).toBeTruthy()
  expect(await band.find({ type: 'Text', text: /another band/ })).toBeTruthy()
  ran.length = 0
  await band.press({ key: 'band-merge' })
  await band.press({ key: 'band-merge' })
  expect(ran[0]).toEqual(['gh', 'pr', 'merge', URL1, '--squash', '--delete-branch'])
  await band.unmount()
})

test('the model can regroup PRs', async ($, on) => {
  engine(on, () => listJson())
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__pr-organizer__set_pr_group',
    urls: ['https://github.com/acme/api/pull/2', 'https://github.com/acme/api/pull/3'],
    group: 'Billing',
  })
  await $.command.run(refreshArgs)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Button', key: 'grp:Billing' }))?.text).toContain('Billing 2')
  await ui.unmount()
})

test('words filter the view, qualifiers search GitHub, and the preview shows the description', async ($, on) => {
  const { ran } = engine(on, () => listJson())
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(refreshArgs)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Markdown', text: /Adds the login endpoint/ })).toBeTruthy()
  expect(await ui.find({ type: 'Markdown', text: /Handle the error here/ })).toBeTruthy()

  await ui.press({ key: 'key-f' })
  await ui.input({ key: 'input-search', text: 'billing' })
  expect(await ui.find({ type: 'Button', key: 'grp:TICKETB-7' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'grp:TICKETA-1' })).toBeFalsy()
  await ui.press({ key: 'key-u' })
  expect(await ui.find({ type: 'Button', key: 'grp:TICKETA-1' })).toBeTruthy()

  ran.length = 0
  await ui.press({ key: 'key-f' })
  await ui.input({ key: 'input-search', text: 'author:pat' })
  const q = ran.find(a => (a[4] ?? '').includes('$q:'))
  expect(q?.[6]).toBe('q=is:pr author:pat archived:false sort:updated-desc')
  const row = await ui.find({ type: 'Button', key: 'https://github.com/acme/api/pull/21' })
  expect(row?.text).toContain('@pat')
  await ui.unmount()
})

test('/prs author searches by another login', async ($, on) => {
  const { ran } = engine(on, () => listJson())
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const out = await $.command.run({ command: 'prs', args: 'author @pat' } as never)
  expect(out.text).toContain('2 PR(s)')
  expect(ran.some(a => a[6] === 'q=is:pr author:pat is:open archived:false sort:updated-desc')).toBe(true)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'https://github.com/acme/api/pull/20' })).toBeTruthy()
  await ui.unmount()
})
