import { RotateCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { presentManage } from '~/api/manage-messages'
import { EmptyState } from '~/components/app/empty-state'
import { Button } from '~/components/ui/button'
import { Skeleton } from '~/components/ui/skeleton'
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
  /** One line under the empty title: why it is empty or how to fill it. */
  readonly emptyHint?: ReactNode
  /** What to do about an empty list, such as the button that adds the first one. */
  readonly emptyAction?: ReactNode
}) {
  const { state, noun } = props
  if (state.isPending) {
    return (
      <div>
        <p role='status' className='sr-only'>
          Loading {noun}...
        </p>
        <div aria-hidden='true' className='flex flex-col border-t border-rule-strong'>
          <div className='flex gap-8 border-b py-3'>
            <Skeleton className='h-2.5 w-20' />
            <Skeleton className='h-2.5 w-14' />
            <Skeleton className='h-2.5 w-16' />
          </div>
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className='flex items-center gap-8 border-b py-4'>
              <Skeleton className='h-3 w-1/3' />
              <Skeleton className='h-3 w-1/5' />
              <Skeleton className='ml-auto h-3 w-16' />
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (state.isError && !state.hasData) {
    return (
      <div>
        <Banner kind='error'>{presentManage(state.error).message}</Banner>
        <Button variant='outline' onClick={() => state.refetch()}>
          <RotateCw aria-hidden='true' />
          Try again
        </Button>
      </div>
    )
  }
  if (state.isEmpty) {
    return (
      <EmptyState title={props.emptyText} action={props.emptyAction}>
        {props.emptyHint}
      </EmptyState>
    )
  }
  return (
    <>
      {props.children}
      {state.isError ? (
        <Banner kind='error' className='mt-4'>
          {presentManage(state.error).message}
        </Banner>
      ) : null}
      {state.hasNextPage ? (
        <div className='mt-5'>
          <Button
            variant='outline'
            aria-disabled={state.isFetchingNextPage}
            onClick={() => {
              if (!state.isFetchingNextPage) {
                state.fetchNextPage()
              }
            }}
          >
            {state.isFetchingNextPage ? 'Loading...' : `Load more ${noun}`}
          </Button>
        </div>
      ) : null}
    </>
  )
}
