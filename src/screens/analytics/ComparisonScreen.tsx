import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { MIN_RATE_SAMPLE, type Role, type TableRow } from 'tula-closeline-contract'
import type { AnalyticsFilter } from '~/api/analytics'
import { presentAnalytics } from '~/api/analytics-messages'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { can } from '~/data/permissions'
import { useAnalyticsTable, useMembersByIdsState } from '~/data/queries'
import { BarList } from '~/screens/analytics/BarList'
import { DownloadCsv } from '~/screens/analytics/DownloadCsv'
import { FilterBar } from '~/screens/analytics/FilterBar'
import { formatCount, formatRate } from '~/screens/analytics/format'
import { rangeProblem } from '~/screens/analytics/range'
import { type AnalyticsSearch, analyticsFilter } from '~/screens/analytics/search'
import { Banner } from '~/ui/Banner'
import { Paged } from '~/ui/Paged'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'

type RateCellValue = TableRow['replyRate']

const COMPARE_BY = [
  { key: 'sends', text: 'Sends' },
  { key: 'replies', text: 'Replies' },
  { key: 'positiveReplies', text: 'Positive replies' },
  { key: 'meetings', text: 'Meetings' },
  { key: 'outcomesWon', text: 'Outcomes won' },
  { key: 'outcomesLost', text: 'Outcomes lost' },
] as const

type CompareKey = (typeof COMPARE_BY)[number]['key']

/** A rate with the records behind it; too few records say so instead of showing a zero. */
function RateCell(props: { readonly rate: RateCellValue }) {
  const { rate } = props
  if (rate.state === 'not_enough_data') {
    return (
      <td className='num'>
        <span>Not enough data</span>
        <span className='block text-xs text-muted-foreground'>
          n = {formatCount(rate.recordCount)} of {MIN_RATE_SAMPLE} needed
        </span>
      </td>
    )
  }
  return (
    <td className='num'>
      <span>{formatRate(rate.value)}</span>
      <span className='block text-xs text-muted-foreground'>
        n = {formatCount(rate.recordCount)}
      </span>
    </td>
  )
}

function ComparisonTable(props: {
  readonly rows: readonly TableRow[]
  readonly groupBy: 'campaign' | 'rep'
  readonly role: Role
  readonly name: (row: TableRow) => string
}) {
  const { groupBy } = props
  const noun = groupBy === 'campaign' ? 'Campaign' : 'Rep'
  return (
    <ScrollRegion label={`${noun} comparison`}>
      <table>
        <thead>
          <tr>
            <th scope='col'>{noun}</th>
            <th scope='col' className='num'>
              Sends
            </th>
            <th scope='col' className='num'>
              Replies
            </th>
            <th scope='col' className='num'>
              Positive replies
            </th>
            <th scope='col' className='num'>
              Meetings
            </th>
            <th scope='col' className='num'>
              Won
            </th>
            <th scope='col' className='num'>
              Lost
            </th>
            <th scope='col' className='num'>
              Reply rate
            </th>
            <th scope='col' className='num'>
              Positive reply rate
            </th>
            <th scope='col' className='num'>
              Meeting rate
            </th>
            <th scope='col' className='num'>
              Win rate
            </th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.group}>
              <th scope='row'>
                <Link
                  to='/analytics'
                  search={
                    groupBy === 'campaign'
                      ? { campaignId: row.group }
                      : { repMembershipId: row.group }
                  }
                  className='link'
                >
                  <Untrusted value={props.name(row)} />
                  <span className='sr-only'> over time</span>
                </Link>
              </th>
              <td className='num'>{formatCount(row.sends.value)}</td>
              <td className='num'>
                {row.replies.value > 0 ? (
                  <Link to='/inbox' className='link'>
                    {formatCount(row.replies.value)}
                    <span className='sr-only'> replies, open the inbox</span>
                  </Link>
                ) : (
                  0
                )}
              </td>
              <td className='num'>
                {row.positiveReplies.value > 0 ? (
                  <Link to='/inbox' search={{ label: 'positive' }} className='link'>
                    {formatCount(row.positiveReplies.value)}
                    <span className='sr-only'> positive replies, open the inbox</span>
                  </Link>
                ) : (
                  0
                )}
              </td>
              <td className='num'>{formatCount(row.meetings.value)}</td>
              <td className='num'>{formatCount(row.outcomesWon.value)}</td>
              <td className='num'>{formatCount(row.outcomesLost.value)}</td>
              <RateCell rate={row.replyRate} />
              <RateCell rate={row.positiveReplyRate} />
              <RateCell rate={row.meetingRate} />
              <RateCell rate={row.winRate} />
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  )
}

/**
 * One comparison of groups, as a ledger with a bar chart over it: a Campaign view for an Owner or
 * Admin, a Rep view for a Manager (their Reps) or a Rep (themselves). The rows come from core's
 * table, so a role never gets numbers outside its scope; the filters offered match what the role
 * may use.
 */
export function ComparisonScreen(props: {
  readonly role: Role
  readonly groupBy: 'campaign' | 'rep'
  readonly search: AnalyticsSearch
  readonly today: string
  readonly onChange: (
    next: {
      [K in keyof AnalyticsSearch]: AnalyticsSearch[K] | undefined
    }
  ) => void
}) {
  const { role, groupBy } = props
  // Core refuses a table filtered on any dimension but the one it groups by, so each view sends
  // only that one (Channel and Agent narrow the Overview charts, never these tables).
  const { campaignId, repMembershipId, from, to } = analyticsFilter(role, props.search, props.today)
  const filter: AnalyticsFilter =
    groupBy === 'rep'
      ? { from, to, ...(repMembershipId ? { repMembershipId } : {}) }
      : { from, to, ...(campaignId ? { campaignId } : {}) }
  const problem = rangeProblem(filter.from, filter.to)
  const table = useAnalyticsTable(filter, groupBy, problem === null)
  const [compare, setCompare] = useState<CompareKey>('sends')
  const lookup = groupBy === 'rep' && can.compareReps(role)
  const { members } = useMembersByIdsState(
    lookup ? table.items.map((row) => row.group) : [],
    lookup
  )
  const name = (row: TableRow): string => {
    if (groupBy === 'rep' && role === 'rep') {
      return 'You'
    }
    const member = groupBy === 'rep' ? members.get(row.group) : undefined
    return member ? member.name || member.email : row.group
  }
  const own = role === 'rep'
  const isRep = groupBy === 'rep'
  const top = table.items.slice(0, 12)
  const compareWord = COMPARE_BY.find((choice) => choice.key === compare)?.text ?? 'Sends'
  return (
    <>
      <PageHeader
        eyebrow='Analytics'
        title={isRep ? (own ? 'Your numbers' : 'Reps') : 'Campaigns'}
        description={
          isRep
            ? own
              ? 'What you did and what it led to. You see your own row only.'
              : 'Each Rep on your Teams side by side. An Owner or Admin sees every Rep; a Manager sees only their own.'
            : 'Your Campaigns side by side: what each sent, what came back and how it ended. A Campaign is shown by its id.'
        }
        actions={problem === null ? <DownloadCsv filter={filter} groupBy={groupBy} /> : undefined}
      />
      <FilterBar
        role={role}
        from={filter.from}
        to={filter.to}
        today={props.today}
        search={{ ...props.search, from: filter.from, to: filter.to }}
        dimensions={{ channelAndAgent: false, rep: isRep && !own, campaign: !isRep }}
        onChange={props.onChange}
      />
      {problem === null ? null : <Banner kind='error'>{problem}</Banner>}
      {isRep ? (
        <Banner kind='info'>
          Today only meetings are credited to a Rep, so a Rep’s other counts stay at zero.
        </Banner>
      ) : null}
      {problem !== null ? null : (
        <div className='flex flex-col gap-12'>
          {!own && table.items.length > 1 ? (
            <Section
              id='analytics-compare'
              title={`${compareWord} by ${isRep ? 'Rep' : 'Campaign'}`}
              description='The first twelve rows loaded, largest first as the table lists them.'
              actions={
                <SelectField
                  inline
                  label='Compare by'
                  name='compare'
                  value={compare}
                  options={COMPARE_BY.map((choice) => ({ value: choice.key, text: choice.text }))}
                  onChange={(event) =>
                    setCompare(
                      COMPARE_BY.find((choice) => choice.key === event.target.value)?.key ?? 'sends'
                    )
                  }
                />
              }
            >
              <BarList
                label={`${compareWord} by ${isRep ? 'Rep' : 'Campaign'}`}
                rows={top.map((row) => ({
                  key: row.group,
                  name: <Untrusted value={name(row)} />,
                  value: row[compare].value,
                }))}
              />
            </Section>
          ) : null}
          <Section
            id='analytics-table'
            title='The numbers'
            description={`Rates need at least ${MIN_RATE_SAMPLE} records behind them; below that the row says so and shows how many it has.`}
            flush
          >
            <Paged
              noun={isRep ? 'Reps' : 'Campaigns'}
              emptyText={
                isRep ? 'No Rep numbers in this range' : 'No Campaign numbers in this range'
              }
              emptyHint={
                isRep
                  ? 'Today only meetings are credited to a Rep, so a Rep appears here once they have a meeting. Widen the dates to look further back.'
                  : 'Widen the dates or clear a filter to look further back.'
              }
              state={table.state}
              present={presentAnalytics}
            >
              <ComparisonTable rows={table.items} groupBy={groupBy} role={role} name={name} />
            </Paged>
          </Section>
        </div>
      )}
    </>
  )
}
