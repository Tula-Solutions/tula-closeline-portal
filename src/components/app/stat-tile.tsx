import { Link, type LinkProps } from '@tanstack/react-router'
import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { Skeleton } from '~/components/ui/skeleton'

/** What a tile knows about its count: still loading, could not be read, or a number (with more beyond it). */
export type StatValue =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'count'; readonly count: number; readonly more: boolean }

/** A count as the tile shows it: `25+` when there are more pages than were read. */
export function statText(value: StatValue): string {
  if (value.kind === 'count') {
    return `${value.count.toLocaleString()}${value.more ? '+' : ''}`
  }
  return '-'
}

/**
 * One number on the dashboard: a label, the count in large tabular figures and a link to the page
 * it comes from. The whole tile is the link's hit area; its accessible name is the label and count.
 */
export function StatTile(props: {
  readonly label: string
  readonly icon: LucideIcon
  readonly value: StatValue
  readonly to: LinkProps['to']
  readonly hint: string
}) {
  const Icon = props.icon
  const text = statText(props.value)
  return (
    <li className='group relative flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 shadow-elev-1 sm:gap-4 sm:p-5 transition-[box-shadow,border-color,transform] duration-200 ease-snappy hover:border-border-strong hover:shadow-elev-2 motion-safe:hover:-translate-y-px'>
      <div className='flex items-center justify-between gap-3'>
        <span className='flex items-center gap-2 text-[0.8125rem] font-medium text-muted-foreground'>
          <span
            aria-hidden='true'
            className='flex size-7 items-center justify-center rounded-md bg-muted text-foreground'
          >
            <Icon className='size-4' />
          </span>
          {props.label}
        </span>
        <ArrowUpRight
          aria-hidden='true'
          className='size-4 text-muted-foreground transition-transform duration-200 ease-snappy group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary'
        />
      </div>
      {props.value.kind === 'loading' ? (
        <Skeleton className='h-9 w-16' />
      ) : (
        <p className='m-0 text-[2rem] leading-none font-semibold tracking-[-0.03em] tabular-nums'>
          {text}
        </p>
      )}
      <p className='m-0 text-xs text-muted-foreground'>
        <Link
          to={props.to}
          aria-label={`${props.label}: ${props.value.kind === 'loading' ? 'loading' : text}. ${props.hint}`}
          className='outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring'
        >
          {props.hint}
        </Link>
      </p>
    </li>
  )
}
