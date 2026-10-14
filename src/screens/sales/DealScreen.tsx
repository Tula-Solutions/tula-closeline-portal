import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowLeft, Handshake } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { calendarDateSchema, OUTCOMES, type Outcome, outcomeSchema } from 'tula-closeline-contract'
import { presentSales } from '~/api/sales-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { StatusBadge } from '~/components/app/status-badge'
import { refresh, useDeal } from '~/data/queries'
import { OUTCOME_LABEL, outcomeLabel } from '~/data/sales-history'
import { Money } from '~/screens/sales/DealsScreen'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import { DateOnly } from '~/ui/When'

const route = getRouteApi('/_app/sales-history/deals/$dealRecordId')

/** One Deal: what the service holds about it, and the form that sets or corrects its Outcome. */
export function DealScreen() {
  useDocumentTitle('Deal')
  const { dealRecordId } = route.useParams()
  const deal = useDeal(dealRecordId)
  return (
    <>
      <PageHeader
        icon={Handshake}
        eyebrow='Sales history'
        title='Deal'
        actions={
          <Link to='/sales-history/deals' className='button button-quiet'>
            <ArrowLeft aria-hidden='true' className='size-4' />
            Back to Deals
          </Link>
        }
      />
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
            <dd>
              <StatusBadge state={deal.data.outcome}>{outcomeLabel(deal.data.outcome)}</StatusBadge>
            </dd>
            <dt>Closed</dt>
            <dd>{deal.data.closedAt === null ? '-' : <DateOnly value={deal.data.closedAt} />}</dd>
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
            closedAt={deal.data.closedAt}
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
  /** The Deal's closing date as the service has it (`YYYY-MM-DD`), or null. */
  readonly closedAt: string | null
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
  const [saved, setSaved] = useState<{
    outcome: Outcome
    date: string | null
    readAt: number
  } | null>(null)
  useEffect(() => {
    if (saved !== null && props.readAt !== saved.readAt) {
      setTypedDate((now) => (now === saved.date ? null : now))
      // A read finished after the save: follow what the service now says (another Admin may
      // have changed it too), unless a different choice was made while it was in flight.
      setChosen((now) => (now === saved.outcome ? null : now))
      setSaved(null)
    }
  }, [props.readAt, saved])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  // The closing date as typed (`YYYY-MM-DD`, from a date input); null until touched, then it follows the Deal.
  const [typedDate, setTypedDate] = useState<string | null>(null)
  const [dateError, setDateError] = useState<string | undefined>(undefined)
  const { formRef, focusFirstError } = useFocusOnError()
  const date = typedDate ?? props.closedAt ?? ''
  const save = useSubmit<{
    outcome: Outcome
    closedAt: string | null | undefined
    typed: string | null
  }>(
    async ({ outcome: chosen, closedAt, typed }) => {
      setError(null)
      await app.salesHistory.setDealOutcome(props.id, chosen, closedAt)
      setNotice('Outcome saved.')
      // The select keeps showing what was saved until a read of the Deal succeeds (the effect
      // above). A failed read is the page's own error, not this save's.
      // The read count as the save answers: a read that finished while it was in flight is older than the save.
      setSaved({ outcome: chosen, date: typed, readAt: readAtNow.current })
      await refresh(app, 'deals')
    },
    { onError: (caught) => setError(presentSales(caught, 'outcome').message) }
  )
  return (
    <form
      ref={formRef}
      noValidate
      aria-labelledby='outcome-heading'
      className='panel max-w-2xl'
      onSubmit={(event) => {
        event.preventDefault()
        setNotice('')
        // The date goes as `YYYY-MM-DD` only; empty sends none, or null to clear one the Deal had.
        // An untouched date is not sent: it could overwrite one another Admin set since the read.
        let closedAt: string | null | undefined
        const field = event.currentTarget.elements.namedItem('closedAt')
        if (field instanceof HTMLInputElement && field.validity.badInput) {
          // A half-typed date reads as '' and must not clear the stored one.
          setDateError('Enter a complete date, or clear the field.')
          focusFirstError()
          return
        }
        if (typedDate === null) {
          closedAt = undefined
        } else if (typedDate === '') {
          closedAt = props.closedAt === null ? undefined : null
        } else {
          const checked = calendarDateSchema.safeParse(typedDate)
          if (!checked.success) {
            setDateError('Enter a real date from 1970 to 2100.')
            focusFirstError()
            return
          }
          closedAt = checked.data
        }
        setDateError(undefined)
        save.submit({ outcome, closedAt, typed: typedDate })
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
      <Field
        type='date'
        label='Closing date (optional)'
        name='closedAt'
        value={date}
        error={dateError}
        hint='The day the Deal was won or lost, or is expected to close. It has no time of day.'
        onChange={(event) => {
          setTypedDate(event.target.value)
          setDateError(undefined)
        }}
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
