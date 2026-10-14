import { getRouteApi, Link } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { OUTCOMES, type Outcome, outcomeSchema } from 'tula-closeline-contract'
import { presentSales } from '~/api/sales-messages'
import { useApp } from '~/app-context'
import { refresh, useDeal } from '~/data/queries'
import { OUTCOME_LABEL, outcomeLabel } from '~/data/sales-history'
import { Money } from '~/screens/sales/DealsScreen'
import { Banner } from '~/ui/Banner'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

const route = getRouteApi('/_app/sales-history/deals/$dealRecordId')

/** One Deal: what the service holds about it, and the form that sets or corrects its Outcome. */
export function DealScreen() {
  useDocumentTitle('Deal')
  const { dealRecordId } = route.useParams()
  const deal = useDeal(dealRecordId)
  return (
    <>
      <h1>Deal</h1>
      <p>
        <Link to='/sales-history/deals'>Back to Deals</Link>
      </p>
      {deal.isPending ? (
        <p role='status' className='hint'>
          Loading...
        </p>
      ) : deal.data === undefined ? (
        <>
          <Banner kind='error'>{presentSales(deal.error, 'list').message}</Banner>
          <p>
            <button type='button' className='button button-quiet' onClick={() => deal.refetch()}>
              Try again
            </button>
          </p>
        </>
      ) : (
        <>
          <dl>
            <dt>Deal id</dt>
            <dd>
              <Untrusted value={deal.data.dealId} />
            </dd>
            <dt>Name</dt>
            <dd>{deal.data.name === null ? '-' : <Untrusted value={deal.data.name} />}</dd>
            <dt>Current Outcome</dt>
            <dd>{outcomeLabel(deal.data.outcome)}</dd>
            <dt>Closed</dt>
            <dd>{deal.data.closedAt === null ? '-' : <When iso={deal.data.closedAt} />}</dd>
            <dt>Amount</dt>
            <dd>
              <Money amount={deal.data.amount} currency={deal.data.currency} />
            </dd>
            <dt>Calls</dt>
            <dd>{deal.data.callCount}</dd>
          </dl>
          <p>
            <Link to='/sales-history/calls' search={{ deal: deal.data.id }}>
              Calls of this Deal
            </Link>
          </p>
          {deal.data.appearedInImport ? null : (
            <p className='hint'>No CSV has named it: it was created by a Call upload.</p>
          )}
          <OutcomeForm
            key={deal.data.id}
            id={deal.data.id}
            current={deal.data.outcome}
            readAt={deal.dataUpdatedAt}
          />
        </>
      )}
    </>
  )
}

function OutcomeForm(props: {
  readonly id: string
  readonly current: string
  /** When the Deal was last read successfully: a newer value means a read finished. */
  readonly readAt: number
}) {
  const app = useApp()
  const parsed = outcomeSchema.safeParse(props.current)
  const current: Outcome = parsed.success ? parsed.data : 'open'
  // Null until the person touches the select: it then follows the Outcome as the service has it.
  const [chosen, setChosen] = useState<Outcome | null>(null)
  const outcome = chosen ?? current
  const readAtNow = useRef(props.readAt)
  // Kept current after each commit; it is only read later, when the save answers.
  useLayoutEffect(() => {
    readAtNow.current = props.readAt
  }, [props.readAt])
  // The Outcome just saved and when the Deal was last read, until a newer read arrives.
  const [saved, setSaved] = useState<{ outcome: Outcome; readAt: number } | null>(null)
  useEffect(() => {
    if (saved !== null && props.readAt !== saved.readAt) {
      // A read finished after the save: follow what the service now says (another Admin may
      // have changed it too), unless a different choice was made while it was in flight.
      setChosen((now) => (now === saved.outcome ? null : now))
      setSaved(null)
    }
  }, [props.readAt, saved])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const save = useSubmit<Outcome>(
    async (chosen) => {
      setError(null)
      await app.salesHistory.setDealOutcome(props.id, chosen)
      setNotice('Outcome saved.')
      // The select keeps showing what was saved until a read of the Deal succeeds (the effect
      // above). A failed read is the page's own error, not this save's.
      // The read count as the save answers: a read that finished while it was in flight is older than the save.
      setSaved({ outcome: chosen, readAt: readAtNow.current })
      await refresh(app, 'deals')
    },
    { onError: (caught) => setError(presentSales(caught, 'outcome').message) }
  )
  return (
    <form
      noValidate
      aria-labelledby='outcome-heading'
      onSubmit={(event) => {
        event.preventDefault()
        setNotice('')
        save.submit(outcome)
      }}
    >
      <h2 id='outcome-heading'>Set the Outcome</h2>
      <p className='hint'>
        Only a won Deal's Calls are used in search. After you change the Outcome, search may lag a
        little behind while its Calls are updated.
      </p>
      {error ? <Banner kind='error'>{error}</Banner> : null}
      <SelectField
        label='Outcome'
        name='outcome'
        value={outcome}
        onChange={(event) => {
          const next = outcomeSchema.safeParse(event.target.value)
          if (next.success) {
            setChosen(next.data)
          }
        }}
        options={OUTCOMES.map((value) => ({ value, text: OUTCOME_LABEL[value] }))}
      />
      <button type='submit' className='button' aria-disabled={save.pending}>
        {save.pending ? 'Saving...' : 'Save Outcome'}
      </button>
      <p role='status' aria-label='Notice' className='notice'>
        {notice}
      </p>
    </form>
  )
}
