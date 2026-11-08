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

export type GroupBy = 'group' | 'repo' | 'none'
export type Prompting = 'comment' | 'reviewers' | 'group' | null

export type Status = { text: string; isError: boolean } | null

declare module 'claude-code' {
  interface PluginState {
    'pr-organizer': {
      prs: Shaped<Pr[]>
      view: View
      groupBy: GroupBy
      selected: string | null
      groups: Record<string, string>
      collapsed: string[]
      status: Status
      isLoading: boolean
      confirm: string | null
      prompting: Prompting
      fetchedAt: number
      scope: string
    }
  }
}
