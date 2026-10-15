import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import type { SearchDocumentsResponse } from 'tula-closeline-contract'
import { useApp } from '~/app-context'
import { EmptyState } from '~/components/app/empty-state'
import { PageHeader } from '~/components/app/page-header'
import { can } from '~/data/permissions'
import { useRole } from '~/data/session-role'
import { Rank, ResultsHeader } from '~/screens/search/ResultsHeader'
import { plural, SearchForm } from '~/screens/search/SearchForm'
import { useDocumentTitle } from '~/ui/useDocumentTitle'

function Results(props: { readonly answer: SearchDocumentsResponse }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const { items, evidence } = props.answer
  return (
    <section
      aria-labelledby='search-documents-results-heading'
      className='m-0 flex flex-col gap-3 motion-safe:animate-rise'
    >
      <ResultsHeader
        id='search-documents-results-heading'
        headingRef={heading}
        evidence={
          items.length === 0 ? null : (
            <p className='hint tabular-nums'>
              Based on {plural(evidence.chunks, 'chunk', 'chunks')} across{' '}
              {plural(evidence.documents, 'Document', 'Documents')} in this search
            </p>
          )
        }
      />
      {items.length === 0 ? (
        <EmptyState title='No matches'>
          No Document text matched this conversation. Try other words, or add a turn.
        </EmptyState>
      ) : (
        <ol aria-label='Matching Document text' className='m-0 list-none p-0'>
          {items.map((item, index) => (
            <li key={`${item.documentId}-${item.page}-${item.snippet}`} className='border-b py-6'>
              <div className='mb-3 flex items-baseline gap-3'>
                <Rank n={index + 1} />
                <h3 className='m-0 min-w-0 flex-1 text-sm font-medium'>
                  <span className='min-w-0'>
                    <bdi>{item.fileName}</bdi>
                    {item.page === null ? '' : `, page ${item.page}`}
                  </span>
                </h3>
              </div>
              <blockquote className='m-0 border-l-2 border-foreground pl-4 font-serif text-[1.0625rem] leading-relaxed'>
                <p className='m-0'>
                  <bdi>{item.snippet}</bdi>
                </p>
              </blockquote>
              <p className='mt-3 mb-0 text-[0.8125rem]'>
                {/* There is no page for one Document: this opens the list of them. */}
                <Link
                  to='/playbook'
                  aria-label={`Documents screen, for result ${index + 1}`}
                  className='rounded-sm font-medium text-foreground underline decoration-border-strong underline-offset-4 outline-none hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring'
                >
                  Documents screen
                </Link>
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/**
 * Search over the Playbook's Documents: the person types a few turns of a conversation and sees
 * the text of the Organization's own Documents that resembles it. Every role may use it. The
 * file names and the text are the Organization's own and are shown as text.
 */
export function SearchDocumentsScreen() {
  useDocumentTitle('Search Documents')
  const app = useApp()
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.searchDocuments(role)) {
    return <PageHeader title='Not allowed' description='Your role cannot search Documents.' />
  }
  return (
    <>
      <PageHeader eyebrow='Playbook' className='mb-6' title='Search Documents' />
      <SearchForm
        label='Search Documents'
        intro="Write what was said so far. The search finds text in your Playbook's Documents that sounds like it."
        run={(request) => app.playbook.searchDocuments(request)}
      >
        {(answer) => <Results answer={answer} />}
      </SearchForm>
    </>
  )
}
