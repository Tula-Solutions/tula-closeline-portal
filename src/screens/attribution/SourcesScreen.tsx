import { getRouteApi } from '@tanstack/react-router'
import { MIN_SOURCE_SAMPLE, type SourcePerformance } from 'tula-closeline-contract'
import { presentSources } from '~/api/analytics-messages'
import { PageHeader } from '~/components/app/page-header'
import { can } from '~/data/permissions'
import { useSourcePerformance } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { formatCount, formatRate } from '~/screens/analytics/format'
import { sourceWord } from '~/screens/attribution/words'
import { Paged } from '~/ui/Paged'
import { SelectField } from '~/ui/SelectField'
import { useDocumentTitle } from '~/ui/useDocumentTitle'

const route = getRouteApi('/_app/analytics/sources')

const FLAGGED = 'cited_often_lost'

/** How well the Playbook sources the Agents cited did: Owners and Admins read it; a Manager or Rep never reaches it and no request is made. */
export function SourcesScreen() {
  useDocumentTitle('Playbook sources')
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.viewAttribution(role)) {
    return (
      <>
        <PageHeader eyebrow='Analytics' title='Not allowed' />
        <p role='status' className='notice'>
          Only an Owner or Admin can see how Playbook sources performed. Ask one of them which
          sources are worth rewriting.
        </p>
      </>
    )
  }
  return <Sources />
}

function WinRate(props: { readonly row: SourcePerformance }) {
  const { row } = props
  // Never a rate below the minimum, whatever the service sent.
  if (row.winRate.state === 'ok' && row.recordCount >= MIN_SOURCE_SAMPLE) {
    return (
      <td className='py-2 pr-4 text-right font-mono tabular-nums'>
        {formatRate(row.winRate.value)}
      </td>
    )
  }
  return (
    <td className='py-2 pr-4 text-right font-mono text-muted-foreground'>
      <span aria-hidden='true'>-</span>
      <span className='sr-only'>Not enough Deals for a rate</span>
      <span className='block text-[11px]'>needs {MIN_SOURCE_SAMPLE}</span>
    </td>
  )
}

function Sources() {
  const { flag } = route.useSearch()
  const navigate = route.useNavigate()
  const sources = useSourcePerformance(flag, true)
  return (
    <>
      <PageHeader
        eyebrow='Analytics'
        title='Playbook sources'
        description={`The Moments and Document passages the Agents cited, and how the Deals they touched ended. A win rate is stated only from ${MIN_SOURCE_SAMPLE} Deals.`}
      />
      <section aria-label='Filters' className='mb-8 border-t border-rule-strong pt-4'>
        <div className='grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] items-end gap-x-6'>
          <SelectField
            label='Show'
            name='flag'
            value={flag ?? 'all'}
            options={[
              { value: 'all', text: 'All sources' },
              { value: FLAGGED, text: 'Cited often, but linked to lost Deals' },
            ]}
            onChange={(event) =>
              void navigate({
                search: { flag: event.target.value === FLAGGED ? FLAGGED : undefined },
                replace: true,
              })
            }
          />
        </div>
      </section>
      <Paged
        noun='sources'
        emptyText={flag === undefined ? 'No sources yet' : 'No source is flagged'}
        emptyHint={
          flag === undefined
            ? 'No Agent has cited a Playbook source in a Deal that was won or lost.'
            : 'No source is cited often and linked to lost Deals. Choose All sources to see every one.'
        }
        state={sources.state}
        present={presentSources}
      >
        <div className='overflow-x-auto'>
          <table className='w-full min-w-[34rem] border-collapse text-sm'>
            <caption className='label-mono mb-1 text-left'>Sources, most touched first</caption>
            <thead>
              <tr className='border-b border-rule-strong text-left'>
                <th scope='col' className='label-mono py-2 pr-4 font-normal'>
                  Source
                </th>
                <th scope='col' className='label-mono py-2 pr-4 text-right font-normal'>
                  Win rate
                </th>
                <th scope='col' className='label-mono py-2 pr-4 text-right font-normal'>
                  n (Deals)
                </th>
                <th scope='col' className='label-mono py-2 pr-4 text-right font-normal'>
                  Won
                </th>
                <th scope='col' className='label-mono py-2 font-normal'>
                  Flag
                </th>
              </tr>
            </thead>
            <tbody>
              {sources.items.map((row) => (
                <tr key={JSON.stringify(row.source)} className='border-b align-top'>
                  <th scope='row' className='py-2 pr-4 text-left font-normal'>
                    {sourceWord(row.source)}
                  </th>
                  <WinRate row={row} />
                  <td className='py-2 pr-4 text-right font-mono tabular-nums'>
                    {formatCount(row.recordCount)}
                  </td>
                  <td className='py-2 pr-4 text-right font-mono tabular-nums'>
                    {formatCount(row.dealsWon)}
                  </td>
                  <td className='py-2'>
                    {row.flag === null ? (
                      <span className='text-muted-foreground'>None</span>
                    ) : (
                      'Cited often, but its Deals tend to be lost'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Paged>
    </>
  )
}
