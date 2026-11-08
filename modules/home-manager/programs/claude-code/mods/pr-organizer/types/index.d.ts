export type PrState = 'OPEN' | 'MERGED' | 'CLOSED'

export type Pr = {
  url: string
  number: number
  title: string
  repo: string
  author: string
  state: PrState
  isDraft: boolean
  review: string | null
  ci: string | null
  mergeable: string
  headRef: string
  baseRef: string
  updatedAt: string
  labels: string[]
  reviewers: string[]
  isMine: boolean
  isReviewRequested: boolean
  activity: number
  lastActor: string | null
}

export type View =
  | 'open'
  | 'draft'
  | 'needs-review'
  | 'approved'
  | 'changes'
  | 'failing'
  | 'to-review'
  | 'merged'
  | 'search'

export type GroupBy = 'group' | 'repo' | 'none'

export type Mode = 'list' | 'detail'

export type Prompting = 'comment' | 'reviewers' | 'group' | 'search' | null

export type Status = { text: string; isError: boolean } | null

export type TimelineItem = {
  kind: 'description' | 'comment' | 'review' | 'thread'
  author: string
  at: string
  body: string
  state?: string
  path?: string
  line?: number | null
  isResolved?: boolean
  replies?: { author: string; at: string; body: string }[]
}

export type Detail = { url: string; items: TimelineItem[] } | null

export type EventKind =
  | 'approved'
  | 'changes'
  | 'ci-failed'
  | 'ci-passed'
  | 'merged'
  | 'comment'
  | 'review-requested'

export type PrEvent = {
  id: string
  url: string
  kind: EventKind
  text: string
  at: number
}

export type Snapshot = Record<
  string,
  {
    review: string | null
    ci: string | null
    state: PrState
    activity: number
    isReviewRequested: boolean
  }
>

declare module 'claude-code' {
  interface PluginState {
    'pr-organizer': {
      prs: Shaped<Pr[]>
      view: View
      groupBy: GroupBy
      mode: Mode
      selected: string | null
      groups: Record<string, string>
      collapsed: string[]
      status: Status
      isLoading: boolean
      confirm: string | null
      prompting: Prompting
      fetchedAt: number
      scope: string
      detail: Shaped<Detail>
      detailOffset: number
      events: Shaped<PrEvent[]>
      pollMinutes: number
      filter: string
      searchQuery: string
      searchResults: Shaped<Pr[]>
      isSearching: boolean
    }
  }
}
