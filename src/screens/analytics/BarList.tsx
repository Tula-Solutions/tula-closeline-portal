import type { ReactNode } from 'react'
import { formatCount } from '~/screens/analytics/format'

/** One bar: what it is, its sort key and its count. */
export type BarRow = { readonly key: string; readonly name: ReactNode; readonly value: number }

/**
 * Counts side by side as thin ink bars from zero, the name on the left and the exact number at the
 * tip, so no axis is needed and nothing depends on colour. The biggest bar is the full width.
 */
export function BarList(props: { readonly label: string; readonly rows: readonly BarRow[] }) {
  const max = Math.max(1, ...props.rows.map((row) => row.value))
  return (
    <ul className='m-0 flex list-none flex-col gap-2 p-0' aria-label={props.label}>
      {props.rows.map((row) => {
        const share = row.value === 0 ? 0 : Math.max(1, (row.value / max) * 100)
        return (
          <li
            key={row.key}
            className='grid grid-cols-[minmax(6rem,12rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm'
          >
            <span className='min-w-0'>{row.name}</span>
            <svg
              viewBox='0 0 100 8'
              preserveAspectRatio='none'
              aria-hidden='true'
              className='block h-2 w-full'
            >
              <rect x={0} y={0} width={100} height={8} className='fill-foreground/8' />
              <rect x={0} y={0} width={share} height={8} className='fill-foreground' />
            </svg>
            <span className='num font-mono text-[0.8125rem]'>{formatCount(row.value)}</span>
          </li>
        )
      })}
    </ul>
  )
}
