import type { AgentKind, AssessmentRateItem } from 'tula-closeline-contract'
import { formatCount, formatRate } from '~/screens/analytics/format'
import { niceTop } from '~/screens/analytics/LineChart'
import { AGENT_WORD } from '~/screens/assessments/words'
import { formatDateOnly } from '~/ui/When'

const WIDTH = 480
const HEIGHT = 152
const LEFT = 44
const RIGHT = 12
const TOP = 12
const BOTTOM = 26
const PLOT_W = WIDTH - LEFT - RIGHT
const PLOT_H = HEIGHT - TOP - BOTTOM

/** The fewest records a week needs before core states a rate. */
const MIN_RECORDS = 20

type Week = { readonly week: string; readonly weekStart: string }

/** The distinct weeks in the items, oldest first. */
function weeksOf(items: readonly AssessmentRateItem[]): readonly Week[] {
  const seen = new Map<string, Week>()
  for (const item of items) {
    seen.set(item.week, { week: item.week, weekStart: item.weekStart })
  }
  return [...seen.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}

/** What the week's number is for one Agent: the newest instruction version's rate when there are several. */
function pickWeek(items: readonly AssessmentRateItem[], week: string): AssessmentRateItem | null {
  const ofWeek = items.filter((item) => item.week === week)
  return (
    ofWeek.reduce<AssessmentRateItem | null>(
      (best, item) =>
        best === null || (item.instructionVersion ?? 0) >= (best.instructionVersion ?? 0)
          ? item
          : best,
      null
    ) ?? null
  )
}

function Plot(props: {
  readonly kind: AgentKind
  readonly weeks: readonly Week[]
  readonly items: readonly AssessmentRateItem[]
}) {
  const { weeks } = props
  const picked = weeks.map((week) => pickWeek(props.items, week.week))
  const rates = picked.map((item) => (item?.state === 'ok' ? item.value : null))
  const top = niceTopRate(Math.max(0, ...rates.map((rate) => rate ?? 0)))
  const last = Math.max(1, weeks.length - 1)
  const x = (index: number) => LEFT + (index / last) * PLOT_W
  const y = (value: number) => TOP + PLOT_H - (value / top) * PLOT_H
  const base = TOP + PLOT_H
  // A week without a stated rate breaks the line rather than drawing it through zero.
  const segments: string[] = []
  let open = ''
  rates.forEach((rate, index) => {
    if (rate === null) {
      if (open !== '') {
        segments.push(open)
        open = ''
      }
      return
    }
    open += `${open === '' ? 'M' : 'L'}${x(index).toFixed(1)} ${y(rate).toFixed(1)} `
  })
  if (open !== '') {
    segments.push(open)
  }
  const thin = rates.filter((rate) => rate === null).length
  const stated = rates.filter((rate): rate is number => rate !== null)
  const latest = stated[stated.length - 1]
  const summary =
    stated.length === 0
      ? `${AGENT_WORD[props.kind]} failure rate by week: no week has enough records to state a rate.`
      : `${AGENT_WORD[props.kind]} failure rate by week, latest ${formatRate(latest ?? 0)}, highest ${formatRate(Math.max(...stated))}.`
  return (
    <figure className='m-0'>
      <figcaption className='label-mono mb-1'>
        {AGENT_WORD[props.kind]}
        {latest === undefined ? '' : ` · latest ${formatRate(latest)}`}
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role='img'
        aria-label={summary}
        className='block h-auto w-full max-w-2xl'
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
              {formatRate(tick)}
            </text>
          </g>
        ))}
        {segments.map((d) => (
          <path
            key={d}
            d={d}
            fill='none'
            className='stroke-foreground'
            strokeWidth={2}
            strokeLinejoin='round'
            strokeLinecap='round'
            vectorEffect='non-scaling-stroke'
          />
        ))}
        {rates.map((rate, index) =>
          rate === null ? (
            <line
              key={weeks[index]?.week}
              x1={x(index)}
              x2={x(index)}
              y1={base - 6}
              y2={base}
              className='stroke-muted-foreground'
              strokeWidth={1.5}
              vectorEffect='non-scaling-stroke'
            />
          ) : (
            <circle
              key={weeks[index]?.week}
              cx={x(index)}
              cy={y(rate)}
              r={3}
              className='fill-foreground stroke-background'
              strokeWidth={1.5}
            />
          )
        )}
        <text
          x={LEFT}
          y={HEIGHT - 6}
          textAnchor='start'
          className='fill-muted-foreground font-mono text-[11px]'
        >
          {formatDateOnly(weeks[0]?.weekStart ?? '')}
        </text>
        <text
          x={WIDTH - RIGHT}
          y={HEIGHT - 6}
          textAnchor='end'
          className='fill-muted-foreground font-mono text-[11px]'
        >
          {formatDateOnly(weeks[weeks.length - 1]?.weekStart ?? '')}
        </text>
      </svg>
      {thin === 0 ? null : (
        <p className='hint mt-2 mb-0'>
          {thin === 1 ? '1 week has' : `${thin} weeks have`} fewer than {MIN_RECORDS} records, so no
          rate is stated (marked on the axis).
        </p>
      )}
    </figure>
  )
}

/** The top gridline as a rate: the next round percentage at or above the highest rate, never below 5%. */
function niceTopRate(highest: number): number {
  return niceTop(Math.max(5, highest * 100)) / 100
}

/** One row of the numbers behind a chart: the week, the Agent, the instruction version, the rate and the records behind it. */
function RateRow(props: { readonly item: AssessmentRateItem }) {
  const { item } = props
  return (
    <tr className='border-b'>
      <th scope='row' className='py-2 pr-4 text-left font-mono text-xs font-normal'>
        {item.week} <span className='text-muted-foreground'>{formatDateOnly(item.weekStart)}</span>
      </th>
      <td className='py-2 pr-4'>{AGENT_WORD[item.agentKind]}</td>
      <td className='py-2 pr-4'>
        {item.instructionVersion === null
          ? 'No instructions'
          : `Version ${item.instructionVersion}`}
      </td>
      <td className='py-2 pr-4 text-right font-mono'>
        {item.state === 'ok' ? (
          formatRate(item.value)
        ) : (
          <span className='text-muted-foreground'>Not enough data</span>
        )}
      </td>
      <td className='py-2 text-right font-mono'>
        {item.state === 'ok'
          ? formatCount(item.recordCount)
          : `${formatCount(item.recordCount)} of ${MIN_RECORDS}`}
      </td>
    </tr>
  )
}

/**
 * The share of assessed output that failed, by week, one hairline plot per Agent on a zero-based
 * axis. A week with fewer than {@link MIN_RECORDS} records has no stated rate: the line breaks and
 * a tick marks the week, and the numbers beneath say how many records it had, never zero. The
 * table is the accessible form of the same numbers.
 */
export function FailureRateChart(props: { readonly items: readonly AssessmentRateItem[] }) {
  const weeks = weeksOf(props.items)
  const kinds: readonly AgentKind[] = (['inbound', 'outbound'] as const).filter((kind) =>
    props.items.some((item) => item.agentKind === kind)
  )
  const rows = [...props.items].sort(
    (a, b) =>
      b.weekStart.localeCompare(a.weekStart) ||
      a.agentKind.localeCompare(b.agentKind) ||
      (b.instructionVersion ?? 0) - (a.instructionVersion ?? 0)
  )
  return (
    <div className='flex flex-col gap-6'>
      <div className='grid gap-8 lg:grid-cols-2'>
        {kinds.map((kind) => (
          <Plot
            key={kind}
            kind={kind}
            weeks={weeks}
            items={props.items.filter((item) => item.agentKind === kind)}
          />
        ))}
      </div>
      <details className='border-t pt-3'>
        <summary className='cursor-pointer text-sm font-medium'>Show the numbers</summary>
        <div className='mt-3 overflow-x-auto'>
          <table className='w-full min-w-[34rem] border-collapse text-sm'>
            <caption className='sr-only'>
              Failure rate by week, Agent and instruction version
            </caption>
            <thead>
              <tr className='border-b text-left'>
                <th scope='col' className='label-mono py-2 pr-4 font-normal'>
                  Week
                </th>
                <th scope='col' className='label-mono py-2 pr-4 font-normal'>
                  Agent
                </th>
                <th scope='col' className='label-mono py-2 pr-4 font-normal'>
                  Instructions
                </th>
                <th scope='col' className='label-mono py-2 pr-4 text-right font-normal'>
                  Failure rate
                </th>
                <th scope='col' className='label-mono py-2 text-right font-normal'>
                  Records
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <RateRow
                  key={`${item.week}|${item.agentKind}|${item.instructionVersion}`}
                  item={item}
                />
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
