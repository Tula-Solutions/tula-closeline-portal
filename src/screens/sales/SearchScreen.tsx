import { Link } from '@tanstack/react-router'
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
        <EmptyState title='No matches'>
          No Moments from won Deals matched this conversation. Try other words, or add a turn.
        </EmptyState>
      ) : (
        <>
          <ol aria-label='Matching Moments' className='m-0 list-none p-0'>
            {items.map((item, index) => {
              const score = percent(item.score)
              return (
                <li
                  key={`${item.callId}-${item.score}-${item.prospect}-${item.repNext}`}
                  className='border-b py-6'
                >
                  <div className='mb-4 flex flex-wrap items-baseline justify-between gap-3'>
                    <div className='flex items-baseline gap-3'>
                      <Rank n={index + 1} />
                      <h3 className='m-0 font-serif text-xl font-normal tabular-nums'>
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
                  <div className='grid gap-4 sm:grid-cols-2 sm:gap-8'>
                    <blockquote className='m-0 border-l border-border-strong pl-4'>
                      <p className='label-mono mb-1.5'>
                        <strong>Prospect said</strong>
                      </p>
                      <p className='m-0 font-serif text-[1.0625rem] leading-relaxed'>
                        <bdi>{item.prospect}</bdi>
                      </p>
                    </blockquote>
                    <blockquote className='m-0 border-l-2 border-foreground pl-4'>
                      <p className='label-mono mb-1.5 text-foreground'>
                        <strong>Rep said next</strong>
                      </p>
                      <p className='m-0 font-serif text-[1.0625rem] leading-relaxed'>
                        {item.repNext === '' ? (
                          <em>Nothing, the Call ended.</em>
                        ) : (
                          <bdi>{item.repNext}</bdi>
                        )}
                      </p>
                    </blockquote>
                  </div>
                  <p className='mt-4 mb-0 flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem]'>
                    {/* There is no page for one Call: this lists the Calls of its Deal. */}
                    <Link
                      to='/sales-history/calls'
                      search={{ deal: item.dealRecordId }}
                      aria-label={`Calls of this Deal for Moment ${index + 1}`}
                      className='rounded-sm font-medium text-foreground ink-link outline-hidden focus-visible:ring-2 focus-visible:ring-ring'
                    >
                      Calls of this Deal
                    </Link>
                    <Link
                      aria-label={`Deal for Moment ${index + 1}`}
                      to='/sales-history/deals/$dealRecordId'
                      params={{ dealRecordId: item.dealRecordId }}
                      className='rounded-sm font-medium text-foreground ink-link outline-hidden focus-visible:ring-2 focus-visible:ring-ring'
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
      <PageHeader eyebrow='Sales history' className='mb-6' title='Search won Deals' />
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
