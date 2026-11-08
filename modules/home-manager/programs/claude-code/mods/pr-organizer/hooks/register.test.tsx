import { expect, mock, test } from 'claude-code/testing'

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

function node(n: number, title: string, branch: string, extra: Record<string, unknown> = {}) {
  return {
    url: `https://github.com/acme/api/pull/${n}`,
    number: n,
    title,
    state: 'OPEN',
    isDraft: false,
    updatedAt: '2026-11-01T00:00:00Z',
    headRefName: branch,
    baseRefName: 'main',
    reviewDecision: 'REVIEW_REQUIRED',
    mergeable: 'MERGEABLE',
    author: { login: 'me' },
    repository: { nameWithOwner: 'acme/api' },
    labels: { nodes: [] },
    reviewRequests: { nodes: [] },
    commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
    ...extra,
  }
}

const GRAPHQL = JSON.stringify({
  data: {
    mine: {
      nodes: [
        node(1, '[TICKETA-1] add login endpoint', 'ticketa-1-login'),
        node(2, 'login tests', 'feature/TICKETA-1-tests', { reviewDecision: 'APPROVED' }),
        node(3, 'TICKETB-7 billing export', 'billing', { isDraft: true }),
        node(4, 'bump deps', 'deps'),
      ],
    },
    merged: { nodes: [] },
    review: {
      nodes: [
        node(9, 'someone else', 'x', { author: { login: 'pat' } }),
      ],
    },
  },
})

test('groups by ticket, filters by state and merges after a confirm', async ($, on) => {
  const ran: string[][] = []
  mock.store(on)
  on('command.register', () => ({ value: { command: 'prs' } }))
  on('tool.register', (_, e) => ({ value: { tool: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    const isQuery = e.argv[1] === 'api'
    return { value: { exitCode: 0, stdout: isQuery ? GRAPHQL : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'prs', args: 'refresh' } as Parameters<typeof $.command.run>[0])

  for (const surface of ['terminal', 'desktop'] as const) {
    ran.length = 0
    const ui = await $.ui.mount({ ...PANE, surface })

    // Grouped: TICKETA-1 holds #1 (title) and #2 (branch); bump deps is ungrouped.
    expect(await ui.find({ type: 'Button', key: 'grp:TICKETA-1' })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'grp:TICKETB-7' })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'grp:Ungrouped' })).toBeTruthy()
    // Not mine: only in the "to-review" view.
    expect(await ui.find({ type: 'Button', key: 'https://github.com/acme/api/pull/9' })).toBeFalsy()

    await ui.press({ key: 'https://github.com/acme/api/pull/1' })
    await ui.press({ key: 'merge' })
    expect(ran.length).toBe(0)
    expect((await ui.find({ type: 'Button', key: 'merge' }))?.text).toContain('Confirm')
    await ui.press({ key: 'merge' })
    expect(ran[0]).toEqual(['gh', 'pr', 'merge', 'https://github.com/acme/api/pull/1', '--squash', '--delete-branch'])

    // Deselect for the next surface.
    await ui.press({ key: 'https://github.com/acme/api/pull/1' })
    await ui.unmount()
  }
})

test('the model can regroup PRs', async ($, on) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'prs' } }))
  on('tool.register', (_, e) => ({ value: { tool: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: GRAPHQL, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__pr-organizer__set_pr_group',
    urls: ['https://github.com/acme/api/pull/4', 'https://github.com/acme/api/pull/3'],
    group: 'Billing',
  })
  await $.command.run({ command: 'prs', args: 'refresh' } as Parameters<typeof $.command.run>[0])

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Button', key: 'grp:Billing' }))?.text).toContain('(2)')
  expect(await ui.find({ type: 'Button', key: 'grp:Ungrouped' })).toBeFalsy()
  await ui.unmount()
})
