import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { VOICE_CALL_STATES, type VoiceCall } from 'tula-closeline-contract'
import type { CallFilters } from '~/api/call-history'
import { presentCallHistory } from '~/api/voice-messages'
import { PageHeader } from '~/components/app/page-header'
import { useCallHistory } from '~/data/calls'
import { can } from '~/data/permissions'
import { useMembersByIds } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { CALL_STATE_WORD, formatDuration } from '~/screens/calls/format'
import { Field } from '~/ui/Field'
import { OwnerCombobox } from '~/ui/OwnerCombobox'
import { Paged } from '~/ui/Paged'
import { plain } from '~/ui/plain'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { When } from '~/ui/When'

const NO_FILTERS: CallFilters = { direction: '', state: '', repMembershipId: '', from: '', to: '' }

/** A date picked in the page (local midnight) as the instant the service filters on. */
function startOf(day: string): string {
  return day === '' ? '' : new Date(`${day}T00:00:00`).toISOString()
}

/** The end of the picked day (local), so that day's Calls are included. */
function endOf(day: string): string {
  return day === '' ? '' : new Date(`${day}T23:59:59.999`).toISOString()
}

/** The Calls history: a Rep sees their own Calls, a Manager their Team's and an Admin all of them. */
export function CallHistoryScreen() {
  useDocumentTitle('Call history')
  const role = useRole()
  const [picked, setPicked] = useState(NO_FILTERS)
  const [rep, setRep] = useState({ id: '', name: '' })
  const [days, setDays] = useState({ from: '', to: '' })
  const filters: CallFilters = {
    ...picked,
    repMembershipId: role !== null && can.viewMembers(role) ? rep.id : '',
    from: startOf(days.from),
    to: endOf(days.to),
  }
  const calls = useCallHistory(filters)
  const names = useMembersByIds(
    calls.items.flatMap((call) => (call.repMembershipId ? [call.repMembershipId] : [])),
    role !== null && can.viewMembers(role)
  )
  if (role === null) {
    return null
  }
  return (
    <>
      <PageHeader
        eyebrow='Calls'
        title='Call history'
        description={
          role === 'rep'
            ? 'The Calls you took, newest first.'
            : role === 'manager'
              ? 'Your Calls and your Team’s, newest first.'
              : 'Every Call in your Organization, newest first.'
        }
      />
      <form
        aria-label='Filter Calls'
        className='mb-6 grid max-w-none grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-5'
        onSubmit={(event) => event.preventDefault()}
      >
        <SelectField
          label='Direction'
          value={picked.direction}
          options={[
            { value: '', text: 'Any' },
            { value: 'inbound', text: 'Inbound' },
            { value: 'outbound', text: 'Outbound' },
          ]}
          onChange={(event) =>
            setPicked({ ...picked, direction: event.target.value as CallFilters['direction'] })
          }
        />
        <SelectField
          label='State'
          value={picked.state}
          options={[
            { value: '', text: 'Any' },
            ...VOICE_CALL_STATES.map((state) => ({
              value: state,
              text: CALL_STATE_WORD[state] ?? state,
            })),
          ]}
          onChange={(event) => setPicked({ ...picked, state: event.target.value })}
        />
        {can.viewMembers(role) ? (
          <OwnerCombobox
            label='Rep'
            anyText='Any Rep'
            enabled
            value={rep.id}
            valueName={rep.name}
            memberRole='rep'
            onChange={(id, name) => setRep({ id, name })}
          />
        ) : null}
        <Field
          label='From'
          type='date'
          value={days.from}
          onChange={(event) => setDays({ ...days, from: event.target.value })}
        />
        <Field
          label='To'
          type='date'
          value={days.to}
          onChange={(event) => setDays({ ...days, to: event.target.value })}
        />
      </form>
      <Paged
        noun='Calls'
        emptyText='No Calls match.'
        emptyHint='Calls appear here once they end.'
        state={calls.state}
        present={presentCallHistory}
      >
        <ul
          className='m-0 list-none divide-y border-y p-0 motion-safe:animate-fade'
          aria-label='Calls'
        >
          {calls.items.map((call) => (
            <CallRow
              key={call.id}
              call={call}
              rep={call.repMembershipId ? names.get(call.repMembershipId) : undefined}
              showRep={role !== 'rep'}
            />
          ))}
        </ul>
      </Paged>
    </>
  )
}

function CallRow(props: {
  readonly call: VoiceCall
  readonly rep: { readonly name?: string | null; readonly email?: string | null } | undefined
  readonly showRep: boolean
}) {
  const { call } = props
  const repName = plain(props.rep?.name ?? props.rep?.email ?? '', 'A Rep')
  return (
    <li className='py-4'>
      <div className='list-item-head'>
        <div className='flex min-w-0 flex-col'>
          <h3 className='m-0 font-serif text-xl font-normal tracking-[-0.01em]'>
            <Link to='/calls/$callId' params={{ callId: call.id }}>
              <Untrusted value={call.prospectNumber} />
            </Link>
          </h3>
          <span className='label-mono mt-1 block'>
            {call.direction === 'inbound' ? 'Inbound' : 'Outbound'} ·{' '}
            {CALL_STATE_WORD[call.state] ?? call.state}
          </span>
          <span className='hint'>
            <When iso={call.createdAt} /> · {formatDuration(call.durationSeconds)}
            {props.showRep ? (
              <>
                {' '}
                · <Untrusted value={repName} />
              </>
            ) : null}
          </span>
        </div>
        <span className='label-mono'>
          Recording {call.recordingState} · Transcript {call.transcriptState}
        </span>
      </div>
    </li>
  )
}
