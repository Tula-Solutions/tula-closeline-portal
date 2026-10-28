import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { SEND_STATES } from 'tula-closeline-contract'
import { presentMail, SEND_REASON } from '~/api/mail-messages'
import type { SendFilter } from '~/api/outbound'
import { PageHeader } from '~/components/app/page-header'
import { useSends } from '~/data/mail-queries'
import { Field } from '~/ui/Field'
import { Paged } from '~/ui/Paged'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { When } from '~/ui/When'

const STATE_WORD = {
  sending: 'Sending',
  sent: 'Sent',
  refused: 'Refused',
  deferred: 'Held back',
  failed: 'Failed',
} as const

/** Every email Closeline sent, refused or held back, filtered to a Campaign or a Prospect, with why it was not sent. */
export function SendLogScreen(props: { readonly filter: SendFilter }) {
  useDocumentTitle('Send log')
  const navigate = useNavigate()
  const sends = useSends(props.filter)
  const [campaign, setCampaign] = useState(props.filter.campaignId ?? '')
  const [prospect, setProspect] = useState(props.filter.prospectId ?? '')
  return (
    <>
      <PageHeader
        eyebrow='Sales'
        title='Send log'
        description='Each email a Campaign tried to send, and why one was refused or held back. Message text is never shown here.'
      />
      <form
        className='mb-6 flex flex-wrap items-end gap-x-6'
        aria-label='Filter the send log'
        onSubmit={(event) => {
          event.preventDefault()
          void navigate({
            to: '/mail/sends',
            search: {
              ...(campaign.trim() === '' ? {} : { campaignId: campaign.trim() }),
              ...(prospect.trim() === '' ? {} : { prospectId: prospect.trim() }),
              ...(props.filter.state === undefined ? {} : { state: props.filter.state }),
            },
          })
        }}
      >
        <Field
          label='Campaign id'
          name='campaignId'
          autoComplete='off'
          spellCheck={false}
          value={campaign}
          onChange={(event) => setCampaign(event.target.value)}
        />
        <Field
          label='Prospect id'
          name='prospectId'
          autoComplete='off'
          spellCheck={false}
          value={prospect}
          onChange={(event) => setProspect(event.target.value)}
        />
        <SelectField
          label='Outcome'
          name='state'
          options={[
            { value: '', text: 'Any' },
            ...SEND_STATES.map((state) => ({ value: state, text: STATE_WORD[state] })),
          ]}
          value={props.filter.state ?? ''}
          onChange={(event) => {
            const state = SEND_STATES.find((one) => one === event.target.value)
            void navigate({
              to: '/mail/sends',
              search: {
                ...(props.filter.campaignId === undefined
                  ? {}
                  : { campaignId: props.filter.campaignId }),
                ...(props.filter.prospectId === undefined
                  ? {}
                  : { prospectId: props.filter.prospectId }),
                ...(state === undefined ? {} : { state }),
              },
            })
          }}
        />
        <div className='mb-4'>
          <button type='submit' className='button'>
            Filter
          </button>
        </div>
      </form>
      <Paged
        noun='sends'
        emptyText='No sends match.'
        emptyHint='Clear the filters to see every send.'
        state={sends.state}
        present={presentMail}
      >
        <ul className='m-0 list-none divide-y border-y p-0' aria-label='Sends'>
          {sends.items.map((send) => (
            <li key={send.id} className='py-4'>
              <p className='m-0'>
                <strong>{STATE_WORD[send.state]}</strong>
                {' · '}step {send.step}
                <span className='hint block'>
                  Campaign <Untrusted value={send.campaignId} />, Prospect{' '}
                  <Untrusted value={send.prospectId} />,{' '}
                  <When iso={send.sentAt ?? send.decidedAt} />
                </span>
                {send.reason === null ? null : (
                  <span className='block'>{SEND_REASON[send.reason]}</span>
                )}
                {send.retryAt === null ? null : (
                  <span className='hint block'>
                    Next try <When iso={send.retryAt} />
                  </span>
                )}
              </p>
              {send.checks.length === 0 ? null : (
                <ul className='m-0 mt-2 list-none p-0' aria-label='Checks before sending'>
                  {send.checks.map((check) => (
                    <li key={check.check} className='hint'>
                      {check.check.replaceAll('_', ' ')}: {check.passed ? 'passed' : 'not passed'}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Paged>
    </>
  )
}
