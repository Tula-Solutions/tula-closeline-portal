import {
  type AgentKind,
  type AssessmentRateItem,
  FINDING_CATEGORIES,
  MIN_RATE_SAMPLE as MIN_RECORDS,
} from 'tula-closeline-contract'
import { formatRate } from '~/screens/analytics/format'
import { pickWeek } from '~/screens/assessments/FailureRateChart'
import { AGENT_WORD, CATEGORY_WORD } from '~/screens/assessments/words'
import { formatDateOnly } from '~/ui/When'

/** The weeks in the items, newest first. */
function weeksNewestFirst(items: readonly AssessmentRateItem[]) {
  const seen = new Map<string, string>()
  for (const item of items) {
    seen.set(item.week, item.weekStart)
  }
  return [...seen].sort((a, b) => b[1].localeCompare(a[1]))
}

function Cell(props: { readonly item: AssessmentRateItem | null }) {
  const { item } = props
  if (item === null) {
    return (
      <td className='py-2 pr-4 text-right font-mono text-muted-foreground'>
        <span aria-hidden='true'>-</span>
        <span className='sr-only'>No assessed output</span>
      </td>
    )
  }
  if (item.state === 'ok') {
    return <td className='py-2 pr-4 text-right font-mono'>{formatRate(item.value)}</td>
  }
  return (
    <td className='py-2 pr-4 text-right font-mono text-muted-foreground'>
      <span aria-hidden='true'>-</span>
      <span className='sr-only'>Not enough data</span>
      <span className='block text-[11px]'>
        {item.recordCount} of {MIN_RECORDS}
      </span>
    </td>
  )
}

function KindTable(props: {
  readonly kind: AgentKind
  readonly items: readonly AssessmentRateItem[]
}) {
  const weeks = weeksNewestFirst(props.items)
  return (
    <div className='overflow-x-auto'>
      <table className='w-full min-w-[34rem] border-collapse text-sm'>
        <caption className='label-mono mb-1 text-left'>{AGENT_WORD[props.kind]}</caption>
        <thead>
          <tr className='border-b text-left'>
            <th scope='col' className='label-mono py-2 pr-4 font-normal'>
              Week
            </th>
            {FINDING_CATEGORIES.map((category) => (
              <th
                key={category}
                scope='col'
                className='label-mono py-2 pr-4 text-right font-normal'
              >
                {CATEGORY_WORD[category]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map(([week, weekStart]) => (
            <tr key={week} className='border-b align-top'>
              <th
                scope='row'
                className='py-2 pr-4 text-left font-mono text-xs font-normal whitespace-nowrap'
              >
                {week} <span className='text-muted-foreground'>{formatDateOnly(weekStart)}</span>
              </th>
              {FINDING_CATEGORIES.map((category) => (
                <Cell
                  key={category}
                  item={pickWeek(
                    props.items.filter((item) => item.category === category),
                    week
                  )}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The failure rate by week and kind of finding, one ledger table per Agent: a week per row, a kind
 * of finding per column. A cell with fewer than {@link MIN_RECORDS} records states no rate, only
 * how many records it had; a cell with no row at all is blank.
 */
export function CategoryRates(props: { readonly items: readonly AssessmentRateItem[] }) {
  const kinds: readonly AgentKind[] = (['inbound', 'outbound'] as const).filter((kind) =>
    props.items.some((item) => item.agentKind === kind)
  )
  return (
    <div className='flex flex-col gap-8'>
      {kinds.map((kind) => (
        <KindTable
          key={kind}
          kind={kind}
          items={props.items.filter((item) => item.agentKind === kind)}
        />
      ))}
    </div>
  )
}
