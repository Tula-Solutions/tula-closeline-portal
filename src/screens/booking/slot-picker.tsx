import { type UseInfiniteQueryResult, useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { PublicSlot } from 'tula-closeline-contract'
import type { PublicSlotPage, PublicSlotsQuery } from '~/api/public-booking'
import { presentPublicBooking } from '~/api/public-booking-messages'
import { Button } from '~/components/ui/button'
import { Banner } from '~/ui/Banner'

export const MAX_RANGE_DAYS = 14
const DAY_MS = 86_400_000
const PAGE_LIMIT = 60

export const MODES = { phone: 'Phone call', video: 'Video call' } as const
export const SECTION = 'mt-0 border-t border-border-strong pt-6 pb-8'
export const H2 = 'm-0 font-serif text-2xl tracking-[-0.02em] outline-hidden'
export const LINK =
  'rounded-sm underline decoration-border-strong decoration-1 underline-offset-4 outline-hidden hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring'

/** The visitor's own time zone from the browser, or UTC when the browser gives a name the contract would refuse. */
export function visitorZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/.test(zone) ? zone : 'UTC'
}

/** The longest range the API allows, starting now (whole seconds, so the two ends are plain timestamps). */
function nextRange() {
  const from = Math.floor(Date.now() / 1000) * 1000
  const stamp = (time: number) => new Date(time).toISOString().replace('.000Z', 'Z')
  return { from: stamp(from), to: stamp(from + MAX_RANGE_DAYS * DAY_MS) }
}

type Group = { readonly key: string; readonly label: string; readonly slots: PublicSlot[] }

/** Free times grouped by their day in `zone`, in the order given (the API sends earliest first). */
function groupByDay(slots: readonly PublicSlot[], zone: string): Group[] {
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: zone })
  const label = new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const groups: Group[] = []
  for (const slot of slots) {
    const at = Date.parse(slot.startsAt)
    const day = key.format(at)
    const last = groups.at(-1)
    if (last?.key === day) {
      last.slots.push(slot)
    } else {
      groups.push({ key: day, label: label.format(at), slots: [slot] })
    }
  }
  return groups
}

/** A time of day in `zone`, such as "10:30 AM". */
function clock(iso: string, zone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(Date.parse(iso))
}

/** A whole date and time in `zone`, such as "Tuesday, November 3, 10:30 AM". */
export function whole(iso: string, zone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(Date.parse(iso))
}

/** One row of a ledger: a small label and its value. */
export function Row(props: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className='dl-group'>
      <dt>{props.label}</dt>
      <dd className='break-words'>{props.children}</dd>
    </div>
  )
}

/**
 * The free times for a link or a manage token: the longest range the API allows from now, paged by
 * cursor. `load` is the call to make; `key` names it for the cache; a change of `reloads` asks again.
 */
export function useSlotQuery(
  key: readonly unknown[],
  reloads: number,
  load: (query: PublicSlotsQuery) => Promise<PublicSlotPage>
) {
  const range = useMemo(() => {
    void reloads
    return nextRange()
  }, [reloads])
  return useInfiniteQuery({
    queryKey: [...key, range.from, reloads],
    queryFn: ({ pageParam, signal }) =>
      load({ ...range, cursor: pageParam, limit: PAGE_LIMIT, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  })
}

/** The free times grouped by day in the visitor's zone, with their loading, empty and error states. */
export function SlotPicker(props: {
  readonly heading: string
  readonly query: UseInfiniteQueryResult<{ pages: PublicSlotPage[] }>
  readonly zone: string
  readonly notice: string | null
  readonly onChoose: (slot: PublicSlot) => void
}) {
  const { query, zone, onChoose } = props
  const groups = useMemo(
    () => groupByDay(query.data?.pages.flatMap((page) => page.items) ?? [], zone),
    [query.data, zone]
  )
  let times: React.ReactNode
  if (query.isError) {
    const shown = presentPublicBooking(query.error)
    times = (
      <>
        <Banner kind={shown.kind === 'no_times' ? 'info' : 'error'}>{shown.message}</Banner>
        {shown.kind === 'no_times' ? null : (
          <button
            type='button'
            className={`inline-flex min-h-11 items-center bg-transparent p-0 ${LINK}`}
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        )}
      </>
    )
  } else if (query.isPending) {
    times = (
      <p role='status' className='m-0'>
        Loading times.
      </p>
    )
  } else if (groups.length === 0) {
    times = (
      <p role='status' className='m-0 max-w-[48ch] leading-relaxed'>
        No times are free in the next {MAX_RANGE_DAYS} days. Check back later.
      </p>
    )
  } else {
    times = (
      <>
        {groups.map((group) => (
          <section
            key={group.key}
            aria-labelledby={`day-${group.key}`}
            className='border-b border-border py-4 md:grid md:grid-cols-[14rem_1fr] md:gap-6'
          >
            <h3 id={`day-${group.key}`} className='label-mono m-0 pt-3 text-foreground'>
              {group.label}
            </h3>
            <ul className='m-0 mt-2 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4 md:mt-0'>
              {group.slots.map((slot) => (
                <li key={slot.startsAt}>
                  <Button
                    type='button'
                    variant='outline'
                    className='w-full tabular-nums'
                    onClick={() => onChoose(slot)}
                  >
                    <time dateTime={slot.startsAt}>{clock(slot.startsAt, zone)}</time>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {query.hasNextPage ? (
          <Button
            type='button'
            variant='link'
            className='mt-3 h-11'
            aria-disabled={query.isFetchingNextPage}
            onClick={() => {
              if (!query.isFetchingNextPage) {
                void query.fetchNextPage()
              }
            }}
          >
            {query.isFetchingNextPage ? 'Loading' : 'Later times'}
          </Button>
        ) : null}
      </>
    )
  }
  return (
    <section className={SECTION} aria-labelledby='times-heading'>
      <h2 id='times-heading' className={H2}>
        {props.heading}
      </h2>
      <p className='m-0 mt-1 mb-4 text-sm text-muted-foreground'>
        Times are shown in your time zone, <span className='tabular-nums'>{zone}</span>.
      </p>
      {props.notice ? <Banner kind='info'>{props.notice}</Banner> : null}
      {times}
    </section>
  )
}
