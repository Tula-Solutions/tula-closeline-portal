import { type PointerEvent, useState } from 'react'
import { formatCount } from '~/screens/analytics/format'
import { eachDay } from '~/screens/analytics/range'
import { formatDateOnly } from '~/ui/When'

/** One day's count. */
export type DayCount = { readonly day: string; readonly value: number }

const WIDTH = 480
const HEIGHT = 152
const LEFT = 40
const RIGHT = 12
const TOP = 12
const BOTTOM = 26
const PLOT_W = WIDTH - LEFT - RIGHT
const PLOT_H = HEIGHT - TOP - BOTTOM

/** The next 1, 2 or 5 times a power of ten at or above `value`, so the top gridline is a round number. */
export function niceTop(value: number): number {
  if (value <= 1) {
    return 1
  }
  const scale = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 5, 10].find((candidate) => candidate * scale >= value) ?? 10
  return step * scale
}

/**
 * One count by day as a single ink line over a faint area, on one axis that starts at zero, with
 * three hairline gridlines and the first and last day on the bottom. Days the service did not list
 * count as zero. Moving over the plot reads off a day; `aria-hidden` there because the table view of
 * the same numbers is the accessible one, and the chart itself is named with its total and peak.
 */
export function LineChart(props: {
  readonly name: string
  readonly unit: string
  readonly from: string
  readonly to: string
  readonly points: readonly DayCount[]
}) {
  const [active, setActive] = useState<number | null>(null)
  const days = eachDay(props.from, props.to)
  const byDay = new Map(props.points.map((point) => [point.day, point.value]))
  const values = days.map((day) => byDay.get(day) ?? 0)
  const top = niceTop(Math.max(0, ...values))
  const last = Math.max(1, days.length - 1)
  const x = (index: number) => LEFT + (index / last) * PLOT_W
  const y = (value: number) => TOP + PLOT_H - (value / top) * PLOT_H
  const line = values
    .map(
      (value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`
    )
    .join(' ')
  const base = TOP + PLOT_H
  const area = `${line} L${x(values.length - 1).toFixed(1)} ${base} L${x(0).toFixed(1)} ${base} Z`
  const peak = values.reduce(
    (best, value, index) => (value > (values[best] ?? 0) ? index : best),
    0
  )
  const total = values.reduce((sum, value) => sum + value, 0)
  const shown = active ?? peak
  const move = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width > 0 && values.length > 0) {
      const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
      setActive(Math.round(ratio * (values.length - 1)))
    }
  }
  const summary = `${props.name} by day, ${formatCount(total)} in total, most on ${formatDateOnly(days[peak] ?? props.from)} with ${formatCount(values[peak] ?? 0)}.`
  return (
    <div className='analytics-chart'>
      <p className='label-mono m-0 mb-1 min-h-4' aria-hidden='true'>
        {days.length === 0
          ? null
          : `${active === null ? 'Most: ' : ''}${formatDateOnly(days[shown] ?? '')} · ${formatCount(values[shown] ?? 0)} ${props.unit}`}
      </p>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role='img'
        aria-label={summary}
        className='block h-auto w-full max-w-2xl touch-pan-y'
      >
        {[0, top / 2, top].map((tick) => (
          <g key={tick}>
            <line
              x1={LEFT}
              x2={WIDTH - RIGHT}
              y1={y(tick)}
              y2={y(tick)}
              className='stroke-border'
              strokeWidth={1}
              vectorEffect='non-scaling-stroke'
            />
            <text
              x={LEFT - 6}
              y={y(tick)}
              textAnchor='end'
              dominantBaseline='middle'
              className='fill-muted-foreground font-mono text-[11px]'
            >
              {formatCount(Math.round(tick * 10) / 10)}
            </text>
          </g>
        ))}
        <path d={area} className='fill-foreground/10' />
        <path
          d={line}
          fill='none'
          className='stroke-foreground'
          strokeWidth={2}
          strokeLinejoin='round'
          strokeLinecap='round'
          vectorEffect='non-scaling-stroke'
        />
        {active === null ? null : (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={TOP}
            y2={base}
            className='stroke-foreground/40'
            strokeWidth={1}
            vectorEffect='non-scaling-stroke'
          />
        )}
        <circle
          cx={x(shown)}
          cy={y(values[shown] ?? 0)}
          r={4.5}
          className='fill-foreground stroke-background'
          strokeWidth={2}
        />
        <text
          x={LEFT}
          y={HEIGHT - 6}
          textAnchor='start'
          className='fill-muted-foreground font-mono text-[11px]'
        >
          {formatDateOnly(days[0] ?? props.from)}
        </text>
        <text
          x={WIDTH - RIGHT}
          y={HEIGHT - 6}
          textAnchor='end'
          className='fill-muted-foreground font-mono text-[11px]'
        >
          {formatDateOnly(days[days.length - 1] ?? props.to)}
        </text>
        <rect
          x={LEFT}
          y={TOP}
          width={PLOT_W}
          height={PLOT_H}
          fill='transparent'
          onPointerMove={move}
          onPointerLeave={() => setActive(null)}
        />
      </svg>
    </div>
  )
}
