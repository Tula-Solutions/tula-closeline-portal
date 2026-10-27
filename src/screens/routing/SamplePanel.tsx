import { type FormEvent, useState } from 'react'
import {
  COMPANY_SIZE_BANDS,
  type RoutingResult,
  type RoutingRule,
  testRoutingRequestSchema,
} from 'tula-closeline-contract'
import { presentRouting } from '~/api/routing-messages'
import { useApp } from '~/app-context'
import { Section } from '~/components/app/section'
import { useBookingTypes, useMembersByIds } from '~/data/queries'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { OwnerCombobox } from '~/ui/OwnerCombobox'
import { plain } from '~/ui/plain'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useSubmit } from '~/ui/useSubmit'

const REASON_WORDS: Readonly<Record<string, string>> = {
  named_rep: 'The rule names this Rep.',
  round_robin_team: 'Next in turn on the Team.',
  round_robin_pool: 'Next in turn in the pool.',
  default_rule: 'The default rule sent it here.',
  off_shift: 'Outside working hours.',
  on_leave: 'On leave.',
  daily_cap_reached: 'Reached the daily limit of Bookings.',
  calendar_not_connected: 'No calendar connected.',
  needs_reconnect: 'The calendar needs to be connected again.',
}

/** A reason exactly as core gave it, with plain words beside it when the portal knows the code. */
function Reason(props: { readonly reason: string }) {
  return (
    <>
      <span className='label-mono'>{props.reason}</span>
      {REASON_WORDS[props.reason] ? (
        <span className='hint'>{REASON_WORDS[props.reason]}</span>
      ) : null}
    </>
  )
}

function Outcome(props: {
  readonly result: RoutingResult
  readonly rules: readonly RoutingRule[]
}) {
  const { result } = props
  const ids = [...result.candidates, ...result.skipped].map((entry) => entry.membershipId)
  const found = useMembersByIds(ids)
  const nameOf = (id: string) => {
    const member = found.get(id)
    return member === undefined ? 'A Rep' : plain(member.name ?? member.email, 'Unnamed member')
  }
  const winner = props.rules.find((rule) => rule.id === result.matchedRuleId)
  return (
    <div className='mt-4 flex flex-col gap-3 border-t border-rule-strong pt-4' aria-live='polite'>
      <p className='m-0'>
        {result.matchedRuleId === null ? (
          'No rule matched this sample.'
        ) : (
          <>
            Winning rule:{' '}
            {winner ? <Untrusted value={winner.name} /> : <span>one not in this list</span>}
          </>
        )}
      </p>
      <h3 className='m-0 text-base'>Reps tried, in order</h3>
      {result.candidates.length === 0 ? (
        <p className='hint m-0'>Nobody would be tried.</p>
      ) : (
        <ol className='m-0 list-none divide-y border-y p-0' aria-label='Reps tried, in order'>
          {result.candidates.map((entry) => (
            <li key={entry.membershipId} className='flex flex-col py-2'>
              <Untrusted value={nameOf(entry.membershipId)} />
              <Reason reason={entry.reason} />
            </li>
          ))}
        </ol>
      )}
      <h3 className='m-0 text-base'>Reps skipped</h3>
      {result.skipped.length === 0 ? (
        <p className='hint m-0'>Nobody was skipped.</p>
      ) : (
        <ul className='m-0 list-none divide-y border-y p-0' aria-label='Reps skipped'>
          {result.skipped.map((entry) => (
            <li key={entry.membershipId} className='flex flex-col py-2'>
              <Untrusted value={nameOf(entry.membershipId)} />
              <Reason reason={entry.reason} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Tries a sample Prospect against the rules: nothing is saved and nobody is notified. */
export function SamplePanel(props: {
  readonly rules: readonly RoutingRule[]
  readonly canPickBookingTypes: boolean
}) {
  const app = useApp()
  const [country, setCountry] = useState('')
  const [region, setRegion] = useState('')
  const [source, setSource] = useState('')
  const [band, setBand] = useState('')
  const [owner, setOwner] = useState({ id: '', name: '' })
  const [bookingTypeId, setBookingTypeId] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [result, setResult] = useState<RoutingResult | null>(null)
  const bookingTypes = useBookingTypes(props.canPickBookingTypes)
  const run = useSubmit<ReturnType<typeof testRoutingRequestSchema.parse>>(
    async (body) => {
      setError(undefined)
      setResult(await app.routing.test(body))
    },
    {
      onError(failure) {
        setResult(null)
        setError(presentRouting(failure).message)
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = testRoutingRequestSchema.safeParse({
      attributes: {
        country: country.trim() === '' ? null : country.trim().toUpperCase(),
        region: region.trim() === '' ? null : region.trim(),
        companySizeBand: band === '' ? null : band,
        accountOwnerMembershipId: owner.id === '' ? null : owner.id,
        source: source.trim() === '' ? null : source.trim(),
      },
      ...(bookingTypeId === '' ? {} : { bookingTypeId }),
    })
    if (!parsed.success) {
      setResult(null)
      setError(
        'Check the sample: the country is two letters, such as US, and the region and source are short text.'
      )
      return
    }
    run.submit(parsed.data)
  }
  return (
    <Section
      id='try-sample'
      title='Try a sample Prospect'
      description='Describe a Prospect and see which rule wins and which Reps would be tried. Nothing is saved.'
    >
      <form onSubmit={onSubmit} noValidate aria-label='Try a sample Prospect' className='gap-0'>
        {error ? <Banner kind='error'>{error}</Banner> : null}
        <Field
          label='Sample country'
          name='sample-country'
          autoComplete='off'
          value={country}
          onChange={(event) => setCountry(event.target.value)}
        />
        <Field
          label='Sample region'
          name='sample-region'
          autoComplete='off'
          value={region}
          onChange={(event) => setRegion(event.target.value)}
        />
        <SelectField
          label='Sample company size'
          name='sample-size'
          value={band}
          options={[
            { value: '', text: 'Not given' },
            ...COMPANY_SIZE_BANDS.map((value) => ({ value, text: value })),
          ]}
          onChange={(event) => setBand(event.target.value)}
        />
        <Field
          label='Sample source'
          name='sample-source'
          autoComplete='off'
          value={source}
          onChange={(event) => setSource(event.target.value)}
        />
        <OwnerCombobox
          label='Sample account owner'
          anyText='Not given'
          value={owner.id}
          valueName={owner.name}
          enabled
          onChange={(id, name) => setOwner({ id, name })}
        />
        {props.canPickBookingTypes ? (
          <SelectField
            label='Sample Booking Type'
            name='sample-booking-type'
            value={bookingTypeId}
            options={[
              { value: '', text: 'Any' },
              ...bookingTypes.items
                .filter((type) => type.state === 'active')
                .map((type) => ({ value: type.id, text: plain(type.name, 'Booking Type') })),
            ]}
            onChange={(event) => setBookingTypeId(event.target.value)}
          />
        ) : null}
        <div className='row-actions'>
          <button type='submit' className='button' aria-disabled={run.pending}>
            {run.pending ? 'Trying...' : 'Try sample'}
          </button>
        </div>
      </form>
      {result ? <Outcome result={result} rules={props.rules} /> : null}
    </Section>
  )
}
