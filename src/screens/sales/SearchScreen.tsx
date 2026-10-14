import { Link } from '@tanstack/react-router'
import { Search, SearchX } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { SearchMomentsResponse } from 'tula-closeline-contract'
import { useApp } from '~/app-context'
import { EmptyState } from '~/components/app/empty-state'
import { PageHeader } from '~/components/app/page-header'
import { Progress } from '~/components/ui/progress'
import { can } from '~/data/permissions'
import { useRole } from '~/data/session-role'
import { Rank, ResultsHeader } from '~/screens/search/ResultsHeader'
import { percent, plural, SearchForm } from '~/screens/search/SearchForm'
import { useDocumentTitle } from '~/ui/useDocumentTitle'

function Evidence(props: { readonly evidence: SearchMomentsResponse['evidence'] }) {
  // The service counts only the best candidates it looked at, so this never speaks for the whole history.
  const { moments, deals } = props.evidence
  return (
    <p className='hint'>
      Based on {plural(moments, 'Moment from won Deals', 'Moments from won Deals')} across{' '}
      {plural(deals, 'Deal', 'Deals')} in this search
    </p>
  )
}

function Results(props: { readonly answer: SearchMomentsResponse }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const { items, evidence } = props.answer
  return (
    <section
      aria-labelledby='search-results-heading'
      className='m-0 flex flex-col gap-3 motion-safe:animate-rise'
    >
      <ResultsHeader
        id='search-results-heading'
        headingRef={heading}
        evidence={items.length === 0 ? null : <Evidence evidence={evidence} />}
      />
      {items.length === 0 ? (
        <EmptyState icon={SearchX} title='No matches'>
          No Moments from won Deals matched this conversation. Try other words, or add a turn.
        </EmptyState>
      ) : (
        <>
          <ol aria-label='Matching Moments' className='m-0 grid list-none gap-3 p-0'>
            {items.map((item, index) => {
              const score = percent(item.score)
              return (
                <li
                  key={`${item.callId}-${item.score}-${item.prospect}-${item.repNext}`}
                  className='rounded-xl border bg-card p-4 shadow-elev-1 transition-[box-shadow,border-color] duration-200 ease-snappy hover:border-border-strong hover:shadow-elev-2 sm:p-5'
                >
                  <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
                    <div className='flex items-center gap-3'>
                      <Rank n={index + 1} />
                      <h3 className='m-0 text-sm font-semibold tabular-nums'>
                        Moment {index + 1}
                        {score === null ? '' : ` (${score}% similar)`}
                      </h3>
                    </div>
                    {score === null ? null : (
                      <div aria-hidden='true' className='flex w-32 items-center gap-2'>
                        <Progress value={score} aria-label='Similarity' className='h-1.5' />
                      </div>
                    )}
                  </div>
                  <div className='grid gap-2.5'>
                    <blockquote className='m-0 mr-6 rounded-xl rounded-tl-sm border bg-muted/50 px-4 py-3 sm:mr-12'>
                      <p className='mb-1 text-xs font-semibold text-muted-foreground'>
                        <strong>Prospect said</strong>
                      </p>
                      <p className='m-0 leading-relaxed'>
                        <bdi>{item.prospect}</bdi>
                      </p>
                    </blockquote>
                    <blockquote className='m-0 ml-6 rounded-xl rounded-tr-sm border border-primary/20 bg-primary/[0.07] px-4 py-3 sm:ml-12'>
                      <p className='mb-1 text-xs font-semibold text-primary'>
                        <strong>Rep said next</strong>
                      </p>
                      <p className='m-0 leading-relaxed'>
                        {item.repNext === '' ? (
                          <em>Nothing, the Call ended.</em>
                        ) : (
                          <bdi>{item.repNext}</bdi>
                        )}
                      </p>
                    </blockquote>
                  </div>
                  <p className='mt-4 mb-0 flex flex-wrap gap-x-5 gap-y-1 border-t pt-3 text-[0.8125rem] font-semibold'>
                    {/* There is no page for one Call: this lists the Calls of its Deal. */}
                    <Link
                      to='/sales-history/calls'
                      search={{ deal: item.dealRecordId }}
                      aria-label={`Calls of this Deal for Moment ${index + 1}`}
                      className='rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring'
                    >
                      Calls of this Deal
                    </Link>
                    <Link
                      aria-label={`Deal for Moment ${index + 1}`}
                      to='/sales-history/deals/$dealRecordId'
                      params={{ dealRecordId: item.dealRecordId }}
                      className='rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring'
                    >
                      Deal
                    </Link>
                  </p>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </section>
  )
}

/**
 * Search over won Deals: the person types a few turns of a conversation and sees the Moments of
 * won Deals that resemble it. Owner and Admin only. The snippets that come back are Transcript
 * text and are shown as text.
 */
export function SearchScreen() {
  useDocumentTitle('Search won Deals')
  const app = useApp()
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.searchWonDeals(role)) {
    return (
      <PageHeader
        title='Not allowed'
        description='Search is for Owners and Admins. Ask an Owner or Admin of your Organization.'
      />
    )
  }
  return (
    <>
      <PageHeader icon={Search} eyebrow='Sales history' className='mb-6' title='Search won Deals' />
      <SearchForm
        label='Search won Deals'
        intro='Write what was said so far. The search finds Moments from your won Deals that sound like it.'
        run={(request) => app.salesHistory.searchMoments(request)}
      >
        {(answer) => <Results answer={answer} />}
      </SearchForm>
    </>
  )
}
