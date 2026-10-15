import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  lookupDealRequestSchema,
  OUTCOMES,
  type Outcome,
  outcomeSchema,
  SALES_HISTORY_ERRORS,
} from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentSales } from '~/api/sales-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { StatusBadge } from '~/components/app/status-badge'
import { useDeals, useSeedDeal } from '~/data/queries'
import { OUTCOME_LABEL, outcomeLabel } from '~/data/sales-history'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { dealTransitionName } from '~/ui/motion'
import { Paged } from '~/ui/Paged'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import { DateOnly } from '~/ui/When'

/** Money as the service holds it (a decimal string) with its currency code, in the reader's grouping. */
export function Money(props: { readonly amount: string | null; readonly currency: string | null }) {
  if (props.amount === null) {
    return <>-</>
  }
  const value = Number(props.amount)
  const text = Number.isFinite(value)
    ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : props.amount
  return (
    <>
      {text} {props.currency ?? ''}
    </>
  )
}

/** Deals: find one by the customer's deal id, or list them by Outcome. */
export function DealsScreen() {
  useDocumentTitle('Deals')
  const [outcome, setOutcome] = useState<Outcome | undefined>(undefined)
  const [unseen, setUnseen] = useState(false)
  const deals = useDeals({ outcome, unseen })
  const seed = useSeedDeal()
  return (
    <>
      <PageHeader
        eyebrow='Sales history'
        title='Deals'
        description='A Deal is a sale. Its Outcome decides whether its Calls are used in search.'
      />
      <div className='grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]'>
        <div className='panel order-2 xl:sticky xl:top-6'>
          <LookupForm />
        </div>
        <div className='page-stack order-1 gap-3'>
          <div className='flex flex-wrap items-end justify-between gap-3 border-t border-rule-strong pt-4'>
            <h2 className='m-0'>All Deals</h2>
            <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
              <div className='field'>
                <label
                  htmlFor='deals-unseen'
                  className='flex items-center text-[0.8125rem] font-medium text-muted-foreground'
                >
                  <input
                    id='deals-unseen'
                    type='checkbox'
                    checked={unseen}
                    onChange={(event) => setUnseen(event.target.checked)}
                  />{' '}
                  Only Deals created from a Call upload
                </label>
              </div>
              <SelectField
                inline
                label='Outcome'
                name='outcome'
                value={outcome ?? ''}
                onChange={(event) => {
                  const parsed = outcomeSchema.safeParse(event.target.value)
                  setOutcome(parsed.success ? parsed.data : undefined)
                }}
                options={[
                  { value: '', text: 'Any Outcome' },
                  ...OUTCOMES.map((value) => ({ value, text: OUTCOME_LABEL[value] })),
                ]}
              />
            </div>
          </div>
          <Paged
            noun='Deals'
            emptyText='There are no Deals to show.'
            emptyHint='Deals arrive from a CSV import or with a Call upload.'
            state={deals.state}
          >
            <ScrollRegion label='Deals'>
              <table className='ledger-stack'>
                <thead>
                  <tr>
                    <th scope='col'>Deal id</th>
                    <th scope='col'>Name</th>
                    <th scope='col'>Outcome</th>
                    <th scope='col'>Closed</th>
                    <th scope='col' className='num'>
                      Amount
                    </th>
                    <th scope='col' className='num'>
                      Calls
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {deals.items.map((deal) => (
                    <tr key={deal.id} className='ink-hover'>
                      <th scope='row'>
                        {/* The address carries the opaque id; the customer's deal id is text only. */}
                        <Link
                          to='/sales-history/deals/$dealRecordId'
                          params={{ dealRecordId: deal.id }}
                          className='ink-link row-link'
                          onClick={(event) => {
                            // A click that opens a new tab or window leaves this page as it is.
                            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                              return
                            }
                            // The Deal opens at once from this row, and its id moves into the page.
                            seed(deal)
                            event.currentTarget.style.setProperty(
                              'view-transition-name',
                              dealTransitionName(deal.id)
                            )
                          }}
                        >
                          <Untrusted value={deal.dealId} />
                        </Link>
                      </th>
                      <td>{deal.name === null ? '-' : <Untrusted value={deal.name} />}</td>
                      <td data-label='Outcome'>
                        <StatusBadge state={deal.outcome}>{outcomeLabel(deal.outcome)}</StatusBadge>
                      </td>
                      <td data-label='Closed' className='text-muted-foreground'>
                        {deal.closedAt === null ? '-' : <DateOnly value={deal.closedAt} />}
                      </td>
                      <td data-label='Amount' className='num'>
                        <Money amount={deal.amount} currency={deal.currency} />
                      </td>
                      <td data-label='Calls' className='num'>
                        {deal.callCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </Paged>
        </div>
      </div>
    </>
  )
}

function LookupForm() {
  const app = useApp()
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [failure, setFailure] = useState<string | null>(null)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const find = useSubmit<string>(
    async (dealId) => {
      setFailure(null)
      // The customer's deal id goes in the body only; the Deal opens by its opaque id.
      const deal = await app.salesHistory.lookupDeal(dealId)
      await navigate({
        to: '/sales-history/deals/$dealRecordId',
        params: { dealRecordId: deal.id },
      })
    },
    {
      onError: (caught) => {
        const shown = presentSales(caught, 'lookup')
        const notFound =
          caught instanceof ApiError && caught.code === SALES_HISTORY_ERRORS['deal.not_found'].code
        setError(notFound ? shown.message : undefined)
        setFailure(notFound ? null : shown.message)
        focusFirstError()
      },
    }
  )
  return (
    <form
      ref={formRef}
      noValidate
      aria-labelledby='lookup-heading'
      onSubmit={(event) => {
        event.preventDefault()
        const parsed = lookupDealRequestSchema.safeParse({ dealId: value })
        if (!parsed.success) {
          setError(
            'Enter the deal id exactly as it is in your CRM or CSV: 1 to 128 characters, with no control characters.'
          )
          setFailure(null)
          focusFirstError()
          return
        }
        setError(undefined)
        find.submit(parsed.data.dealId)
      }}
    >
      <h2 id='lookup-heading'>Find a Deal</h2>
      {failure ? (
        <Banner kind='error' innerRef={bannerRef}>
          {failure}
        </Banner>
      ) : null}
      <Field
        label="Customer's deal id"
        name='dealId'
        autoComplete='off'
        value={value}
        error={error}
        hint='The id from your CRM or CSV.'
        onChange={(event) => {
          setValue(event.target.value)
          setError(undefined)
        }}
      />
      <button type='submit' className='button' aria-disabled={find.pending}>
        {find.pending ? 'Finding...' : 'Find Deal'}
      </button>
    </form>
  )
}
