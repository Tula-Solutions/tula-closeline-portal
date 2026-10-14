import { Link } from '@tanstack/react-router'
import { ArrowRight, FileSearch, FileText, SearchX } from 'lucide-react'
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
        <EmptyState icon={SearchX} title='No matches'>
          No Document text matched this conversation. Try other words, or add a turn.
        </EmptyState>
      ) : (
        <ol aria-label='Matching Document text' className='m-0 grid list-none gap-3 p-0'>
          {items.map((item, index) => (
            <li
              key={`${item.documentId}-${item.page}-${item.snippet}`}
              className='rounded-xl border bg-card p-4 shadow-elev-1 transition-[box-shadow,border-color] duration-200 ease-snappy hover:border-border-strong hover:shadow-elev-2 sm:p-5'
            >
              <div className='mb-3 flex items-center gap-3'>
                <Rank n={index + 1} />
                <h3 className='m-0 flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold'>
                  <FileText aria-hidden='true' className='size-4 shrink-0 text-muted-foreground' />
                  <span className='min-w-0'>
                    <bdi>{item.fileName}</bdi>
                    {item.page === null ? '' : `, page ${item.page}`}
                  </span>
                </h3>
              </div>
              <blockquote className='m-0 rounded-lg border-l-[3px] border-primary bg-primary/[0.06] px-4 py-3 text-[0.9375rem] leading-relaxed'>
                <p className='m-0'>
                  <bdi>{item.snippet}</bdi>
                </p>
              </blockquote>
              <p className='mt-3 mb-0 text-[0.8125rem] font-semibold'>
                {/* There is no page for one Document: this opens the list of them. */}
                <Link
                  to='/playbook'
                  aria-label={`Documents screen, for result ${index + 1}`}
                  className='inline-flex items-center gap-1 rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring'
                >
                  Documents screen
                  <ArrowRight aria-hidden='true' className='size-3.5' />
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
      <PageHeader icon={FileSearch} eyebrow='Playbook' className='mb-6' title='Search Documents' />
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
