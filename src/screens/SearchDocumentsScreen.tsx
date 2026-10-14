import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import type { SearchDocumentsResponse } from 'tula-closeline-contract'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { can } from '~/data/permissions'
import { useRole } from '~/data/session-role'
import { plural, SearchForm } from '~/screens/search/SearchForm'
import { useDocumentTitle } from '~/ui/useDocumentTitle'

function Results(props: { readonly answer: SearchDocumentsResponse }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const { items, evidence } = props.answer
  return (
    <section aria-labelledby='search-documents-results-heading'>
      <h2 id='search-documents-results-heading' tabIndex={-1} ref={heading}>
        Results
      </h2>
      {items.length === 0 ? (
        <p>No Document text matched this conversation. Try other words, or add a turn.</p>
      ) : (
        <>
          <p className='hint'>
            Based on {plural(evidence.chunks, 'chunk', 'chunks')} across{' '}
            {plural(evidence.documents, 'Document', 'Documents')} in this search
          </p>
          <ol aria-label='Matching Document text'>
            {items.map((item, index) => (
              <li key={`${item.documentId}-${item.page}-${item.snippet}`}>
                <h3>
                  <bdi>{item.fileName}</bdi>
                  {item.page === null ? '' : `, page ${item.page}`}
                </h3>
                <p>
                  <bdi>{item.snippet}</bdi>
                </p>
                <p>
                  {/* There is no page for one Document: this opens the list of them. */}
                  <Link to='/playbook' aria-label={`Documents screen, for result ${index + 1}`}>
                    Documents screen
                  </Link>
                </p>
              </li>
            ))}
          </ol>
        </>
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
      <PageHeader title='Search Documents' />
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
