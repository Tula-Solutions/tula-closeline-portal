import { type FormEvent, useState } from 'react'
import type { Role } from 'tula-closeline-contract'
import { AGENT_KINDS, INBOX_CHANNELS } from 'tula-closeline-contract'
import { can } from '~/data/permissions'
import { presetRange, RANGE_PRESETS, rangeProblem } from '~/screens/analytics/range'
import type { AnalyticsSearch } from '~/screens/analytics/search'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { OwnerCombobox } from '~/ui/OwnerCombobox'
import { SelectField } from '~/ui/SelectField'

const CHANNEL_WORD = { email: 'Email', linkedin: 'LinkedIn', chat: 'Chat' } as const
const AGENT_WORD = { inbound: 'Inbound Agent', outbound: 'Outbound Agent' } as const
const ANY = 'any'

/** Which dimension filters a view offers (a role may still not hold them; see `can`). */
export type Dimensions = {
  readonly channelAndAgent: boolean
  readonly rep: boolean
  readonly campaign: boolean
}

function Dates(props: {
  readonly from: string
  readonly to: string
  readonly onApply: (range: { from: string; to: string }) => void
}) {
  const [from, setFrom] = useState(props.from)
  const [to, setTo] = useState(props.to)
  const [problem, setProblem] = useState<string | null>(null)
  const apply = (event: FormEvent) => {
    event.preventDefault()
    const found = rangeProblem(from, to)
    setProblem(found)
    if (found === null) {
      props.onApply({ from, to })
    }
  }
  return (
    <form className='analytics-dates' aria-label='Custom date range' onSubmit={apply} noValidate>
      <Field
        label='From'
        name='from'
        type='date'
        value={from}
        onChange={(e) => setFrom(e.target.value)}
      />
      <Field label='To' name='to' type='date' value={to} onChange={(e) => setTo(e.target.value)} />
      <button type='submit' className='button button-quiet'>
        Apply dates
      </button>
      {problem === null ? null : (
        <div className='analytics-dates-problem'>
          <Banner kind='error'>{problem}</Banner>
        </div>
      )}
    </form>
  )
}

/**
 * The filters of an analytics view, in one block above it: a range as one click or two dates (both
 * ends included, 13 months at most) and, for the roles core allows, Channel, Agent and Rep. Only
 * filters the role may use are shown, so no one meets a forbidden error. Every choice goes to the
 * address, so a view can be shared and the back button works.
 */
export function FilterBar(props: {
  readonly role: Role
  readonly from: string
  readonly to: string
  readonly today: string
  readonly search: AnalyticsSearch
  readonly dimensions: Dimensions
  readonly onChange: (
    next: {
      [K in keyof AnalyticsSearch]: AnalyticsSearch[K] | undefined
    }
  ) => void
}) {
  const { role, search, dimensions } = props
  const wide = can.compareCampaigns(role)
  return (
    <section aria-label='Filters' className='analytics-filters' data-slot='analytics-filters'>
      <fieldset aria-label='Date range' className='analytics-presets'>
        {RANGE_PRESETS.map((preset) => {
          const range = presetRange(preset.days, props.today)
          const chosen = range.from === props.from && range.to === props.to
          return (
            <button
              key={preset.days}
              type='button'
              className='button button-quiet'
              aria-pressed={chosen}
              onClick={() => props.onChange(range)}
            >
              {preset.text}
            </button>
          )
        })}
      </fieldset>
      <Dates
        key={`${props.from}|${props.to}`}
        from={props.from}
        to={props.to}
        onApply={(range) => props.onChange(range)}
      />
      {dimensions.channelAndAgent && wide ? (
        <div className='analytics-dimensions'>
          <SelectField
            label='Channel'
            name='channel'
            value={search.channel ?? ANY}
            options={[
              { value: ANY, text: 'All Channels' },
              ...INBOX_CHANNELS.map((channel) => ({ value: channel, text: CHANNEL_WORD[channel] })),
            ]}
            onChange={(event) =>
              props.onChange({ channel: INBOX_CHANNELS.find((c) => c === event.target.value) })
            }
          />
          <SelectField
            label='Agent'
            name='agentKind'
            value={search.agentKind ?? ANY}
            options={[
              { value: ANY, text: 'Both Agents' },
              ...AGENT_KINDS.map((kind) => ({ value: kind, text: AGENT_WORD[kind] })),
            ]}
            onChange={(event) =>
              props.onChange({ agentKind: AGENT_KINDS.find((k) => k === event.target.value) })
            }
          />
        </div>
      ) : null}
      {dimensions.rep && can.compareReps(role) ? (
        <OwnerCombobox
          label='Rep'
          anyText='All Reps'
          value={search.repMembershipId ?? ''}
          valueName=''
          memberRole='rep'
          enabled
          onChange={(id) => props.onChange({ repMembershipId: id === '' ? undefined : id })}
        />
      ) : null}
      {dimensions.campaign && wide && search.campaignId ? (
        <p className='analytics-chip'>
          <span className='label-mono'>Campaign</span> <bdi>{search.campaignId}</bdi>{' '}
          <button
            type='button'
            className='button button-quiet'
            onClick={() => props.onChange({ campaignId: undefined })}
          >
            Clear Campaign
          </button>
        </p>
      ) : null}
    </section>
  )
}
