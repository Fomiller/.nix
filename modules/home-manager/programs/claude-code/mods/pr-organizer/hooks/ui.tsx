import type { Elements } from 'claude-code'

import type { Pr, TimelineItem } from '../types'
import { ago, badge, ciMark, clip, shortRef } from './model'

export type Els = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Markdown' | 'Code' | 'Link'>

const STATE_COLOR: Record<string, string> = {
  approved: 'success',
  changes: 'error',
  review: 'warning',
  draft: 'inactive',
  merged: 'merged',
  closed: 'inactive',
}

export function chip(els: Els, text: string, color: string) {
  const { Text } = els
  return (
    <Text backgroundColor={color} color="inverseText" bold>
      {` ${text} `}
    </Text>
  )
}

export function stateChip(els: Els, pr: Pr) {
  const b = badge(pr)
  return chip(els, b.text, STATE_COLOR[b.text] ?? 'inactive')
}

export function ciChip(els: Els, pr: Pr) {
  const label =
    pr.ci === 'SUCCESS'
      ? 'CI passing'
      : pr.ci === 'FAILURE' || pr.ci === 'ERROR'
        ? 'CI failing'
        : pr.ci === 'PENDING' || pr.ci === 'EXPECTED'
          ? 'CI running'
          : 'no CI'
  return chip(els, label, ciMark(pr).color)
}

export function rule(els: Els, width: number, label?: string) {
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

export function prRowText(els: Els, pr: Pr, isCursor: boolean, width: number, now: number) {
  const { Text } = els
  const b = badge(pr)
  const ci = ciMark(pr)
  const ref = shortRef(pr)
  const who = pr.isMine ? '' : `@${pr.author}`
  const age = ago(pr.updatedAt, now)
  const room = Math.max(8, width - ref.length - who.length - age.length - 18)
  return [
    <Text color={isCursor ? 'claude' : 'promptBorder'}>{isCursor ? '▌' : ' '}</Text>,
    <Text color={ci.color}>{pr.ci === null ? ' ○ ' : ' ● '}</Text>,
    <Text color={STATE_COLOR[b.text] ?? 'inactive'}>{b.text.padEnd(9)}</Text>,
    <Text dimColor>{ref.padEnd(Math.min(14, ref.length + 1))}</Text>,
    <Text bold={isCursor} inverse={isCursor}>{` ${clip(pr.title, room)} `}</Text>,
    who ? <Text color="suggestion">{` ${who}`}</Text> : '',
    <Text dimColor>{` ${age}`}</Text>,
  ]
}

export function groupRowText(els: Els, name: string, count: number, isFolded: boolean, isCursor: boolean, width: number) {
  const { Text } = els
  return [
    <Text color={isCursor ? 'claude' : 'promptBorder'}>{isCursor ? '▌' : ' '}</Text>,
    <Text color="claude">{isFolded ? ' ▸ ' : ' ▾ '}</Text>,
    <Text bold color="claude">
      {name}
    </Text>,
    <Text dimColor>{` ${count} `}</Text>,
    <Text color="promptBorder">{'┄'.repeat(Math.max(2, width - name.length - String(count).length - 9))}</Text>,
  ]
}

export function bodyOf(body: string, lines: number): { text: string; isCut: boolean } {
  const all = body.trim().split('\n')
  if (all.length <= lines) return { text: all.join('\n'), isCut: false }
  let cut = all.slice(0, lines)
  const fences = cut.filter(l => l.trimStart().startsWith('```')).length
  if (fences % 2 === 1) cut = [...cut, '```']
  return { text: cut.join('\n'), isCut: true }
}

function itemColor(item: TimelineItem): string {
  if (item.state === 'APPROVED') return 'success'
  if (item.state === 'CHANGES_REQUESTED') return 'error'
  if (item.kind === 'thread') return 'suggestion'
  return 'promptBorder'
}

export function commentCard(
  els: Els,
  item: TimelineItem,
  opts: { width: number; now: number; lines: number; isExpanded?: boolean; key: string; showDiff?: boolean },
) {
  const { Box, Text, Markdown, Code } = els
  const when = item.at ? `${ago(item.at, opts.now)} ago` : ''
  const body = bodyOf(item.body, opts.isExpanded ? 400 : opts.lines)
  const stateLabel =
    item.kind === 'review' && item.state ? item.state.toLowerCase().replace('_', ' ') : null
  return (
    <Box key={opts.key} flexDirection="column" borderStyle="round" borderColor={itemColor(item)} paddingX={1}>
      <Box flexDirection="row" columnGap={1} flexWrap="wrap">
        <Text bold color="claude">
          {item.author}
        </Text>
        {stateLabel && chip(els, stateLabel, itemColor(item))}
        {item.kind === 'thread' && (
          <Text color="suggestion">{clip(`${item.path}${item.line ? `:${item.line}` : ''}`, opts.width - 30)}</Text>
        )}
        {item.isResolved && chip(els, 'resolved', 'inactive')}
        <Text dimColor>{when}</Text>
      </Box>
      {opts.showDiff !== false && item.diff && <Code source={item.diff} format="diff" path={item.path} wrap="truncate-end" />}
      {body.text !== '' && <Markdown text={body.text} />}
      {body.isCut && <Text dimColor>… z shows the whole comment</Text>}
      {(item.replies ?? []).map((r, i) => (
        <Box key={`${opts.key}-r${i}`} flexDirection="column" paddingLeft={2}>
          <Text>
            <Text color="promptBorder">↳ </Text>
            <Text bold color="claude">
              {r.author}
            </Text>
            <Text dimColor>{r.at ? ` ${ago(r.at, opts.now)} ago` : ''}</Text>
          </Text>
          <Markdown text={bodyOf(r.body, opts.isExpanded ? 200 : 4).text} />
        </Box>
      ))}
    </Box>
  )
}

export function prHeader(els: Els, pr: Pr, opts: { width: number; now: number; group: string }) {
  const { Box, Text, Link } = els
  return (
    <Box flexDirection="column">
      <Text bold>{clip(pr.title, opts.width)}</Text>
      <Box flexDirection="row" columnGap={1} flexWrap="wrap">
        {stateChip(els, pr)}
        {ciChip(els, pr)}
        {pr.mergeable === 'CONFLICTING' && chip(els, 'conflicts', 'error')}
        <Link href={pr.url} label={`${pr.repo}#${pr.number}`} />
      </Box>
      <Text>
        <Text color="suggestion">@{pr.author}</Text>
        <Text dimColor>
          {clip(` · ${pr.headRef} → ${pr.baseRef} · ${ago(pr.updatedAt, opts.now)} ago · ${opts.group}`, Math.max(10, opts.width - pr.author.length - 2))}
        </Text>
      </Text>
      {pr.reviewers.length > 0 && (
        <Text>
          <Text dimColor>waiting on </Text>
          <Text color="warning">{clip(pr.reviewers.join(', '), opts.width - 12)}</Text>
        </Text>
      )}
      {pr.labels.length > 0 && (
        <Box flexDirection="row" columnGap={1} flexWrap="wrap">
          {pr.labels.slice(0, 6).map(l => chip(els, l, 'permission'))}
        </Box>
      )}
    </Box>
  )
}
