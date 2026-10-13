import type { ReactNode } from 'react'
import { presentManage } from '~/api/manage-messages'
import { Banner } from '~/ui/Banner'

/** The state of a paginated list as the screen needs it. */
export type PagedState = {
  readonly isPending: boolean
  readonly isError: boolean
  readonly error: unknown
  readonly hasData: boolean
  readonly isEmpty: boolean
  readonly hasNextPage: boolean
  readonly isFetchingNextPage: boolean
  readonly fetchNextPage: () => void
  readonly refetch: () => void
}

/**
 * Wraps a list with its loading, error and empty states and a "Load more" button (one page at a
 * time, never everything). `noun` is plural ("members"); the list itself is `children`.
 */
export function Paged(props: {
  readonly noun: string
  readonly emptyText: string
  readonly state: PagedState
  readonly children: ReactNode
}) {
  const { state, noun } = props
  if (state.isPending) {
    return (
      <p role='status' className='hint'>
        Loading {noun}...
      </p>
    )
  }
  if (state.isError && !state.hasData) {
    return (
      <div>
        <Banner kind='error'>{presentManage(state.error).message}</Banner>
        <p>
          <button type='button' className='button button-quiet' onClick={() => state.refetch()}>
            Try again
          </button>
        </p>
      </div>
    )
  }
  if (state.isEmpty) {
    return <p>{props.emptyText}</p>
  }
  return (
    <>
      {props.children}
      {state.isError ? <Banner kind='error'>{presentManage(state.error).message}</Banner> : null}
      {state.hasNextPage ? (
        <p>
          <button
            type='button'
            className='button button-quiet'
            aria-disabled={state.isFetchingNextPage}
            onClick={() => {
              if (!state.isFetchingNextPage) {
                state.fetchNextPage()
              }
            }}
          >
            {state.isFetchingNextPage ? 'Loading...' : `Load more ${noun}`}
          </button>
        </p>
      ) : null}
    </>
  )
}
