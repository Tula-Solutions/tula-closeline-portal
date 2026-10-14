import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import type { SearchMomentsResponse } from 'tula-closeline-contract'
import { useApp } from '~/app-context'
import { can } from '~/data/permissions'
import { useRole } from '~/data/session-role'
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
    <section aria-labelledby='search-results-heading'>
      <h2 id='search-results-heading' tabIndex={-1} ref={heading}>
        Results
      </h2>
      {items.length === 0 ? (
        <p>No Moments from won Deals matched this conversation. Try other words, or add a turn.</p>
      ) : (
        <>
          <Evidence evidence={evidence} />
          <ol aria-label='Matching Moments'>
            {items.map((item, index) => {
              const score = percent(item.score)
              return (
                <li key={`${item.callId}-${item.score}-${item.prospect}-${item.repNext}`}>
                  <h3>
                    Moment {index + 1}
                    {score === null ? '' : ` (${score}% similar)`}
                  </h3>
                  <p>
                    <strong>Prospect said</strong> <bdi>{item.prospect}</bdi>
                  </p>
                  <p>
                    <strong>Rep said next</strong>{' '}
                    {item.repNext === '' ? (
                      <em>Nothing, the Call ended.</em>
                    ) : (
                      <bdi>{item.repNext}</bdi>
                    )}
                  </p>
                  <p>
                    {/* There is no page for one Call: this lists the Calls of its Deal. */}
                    <Link
                      to='/sales-history/calls'
                      search={{ deal: item.dealRecordId }}
                      aria-label={`Calls of this Deal for Moment ${index + 1}`}
                    >
                      Calls of this Deal
                    </Link>{' '}
                    <Link
                      aria-label={`Deal for Moment ${index + 1}`}
                      to='/sales-history/deals/$dealRecordId'
                      params={{ dealRecordId: item.dealRecordId }}
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
      <>
        <h1>Not allowed</h1>
        <p>Search is for Owners and Admins. Ask an Owner or Admin of your Organization.</p>
      </>
    )
  }
  return (
    <>
      <h1>Search won Deals</h1>
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
