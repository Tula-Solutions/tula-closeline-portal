import { useState } from 'react'
import { AGENT_CALLING_WINDOW, AGENT_KINDS, type AgentKind } from 'tula-closeline-contract'
import { presentAgent } from '~/api/agent-messages'
import { fingerprint } from '~/api/idempotency'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { can } from '~/data/permissions'
import { refresh, useAgentPause } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { ControlsSection } from '~/screens/agent/ControlsSection'
import { InstructionsSection } from '~/screens/agent/InstructionsSection'
import { KIND_NAME } from '~/screens/agent/words'
import { Banner } from '~/ui/Banner'
import { Confirm } from '~/ui/Confirm'
import { SelectField } from '~/ui/SelectField'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFeedback } from '~/ui/useFeedback'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

const hour = (value: number) => `${String(value).padStart(2, '0')}:00`

/** How the Agents are told to behave and how far they may act alone: Owners and Admins write, Managers read. */
export function AgentScreen() {
  useDocumentTitle('Agent')
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.viewAgent(role)) {
    return (
      <>
        <PageHeader eyebrow='Sales' title='Agent' />
        <p role='status' className='notice'>
          Only an Owner, Admin or Manager can see how the Agents are set up. Ask one of them if
          something should change.
        </p>
      </>
    )
  }
  return <AgentPage manage={can.manageAgent(role)} />
}

function AgentPage(props: { readonly manage: boolean }) {
  const [kind, setKind] = useState<AgentKind>('inbound')
  const feedback = useFeedback()
  return (
    <>
      <PageHeader
        eyebrow='Sales'
        title='Agent'
        description={
          props.manage
            ? 'What the Agents are told, how far they may act without a person, and the switch that stops them all.'
            : 'What the Agents are told and how far they may act without a person. Only an Owner or Admin can change it.'
        }
      />
      <div className='flex flex-col gap-12'>
        <p role='status' className='notice'>
          {feedback.notice}
        </p>
        <PauseSection manage={props.manage} onDone={feedback.done} onFail={feedback.failed} />
        <Section
          id='fixed-rules'
          title='Fixed rules'
          description='These hold for every Agent whatever the instructions or the control level say. There is no setting to turn any of them off.'
        >
          <ul className='m-0 list-none divide-y border-y p-0'>
            <li className='py-2'>
              An Agent calls or texts a Prospect only when a Contact Consent exists for that
              channel.
            </li>
            <li className='py-2'>
              Every call tells the Prospect it is an AI and that it is recorded.
            </li>
            <li className='py-2'>
              Calls are placed only between {hour(AGENT_CALLING_WINDOW.startHour)} and{' '}
              {hour(AGENT_CALLING_WINDOW.endHour)}. A send window can only narrow this.
            </li>
            <li className='py-2'>
              A reply with no Playbook source, one that fails a check, one in an escalated
              Conversation and the first message to a Prospect always wait for a person.
            </li>
          </ul>
        </Section>
        <SelectField
          label='Agent'
          name='agent-kind'
          value={kind}
          options={AGENT_KINDS.map((item) => ({ value: item, text: KIND_NAME[item] }))}
          onChange={(event) => setKind(event.target.value === 'outbound' ? 'outbound' : 'inbound')}
        />
        <InstructionsSection
          key={`instructions-${kind}`}
          kind={kind}
          manage={props.manage}
          onDone={feedback.done}
          onFail={feedback.failed}
        />
        <ControlsSection
          key={`controls-${kind}`}
          kind={kind}
          manage={props.manage}
          onDone={feedback.done}
          onFail={feedback.failed}
        />
      </div>
    </>
  )
}

function PauseSection(props: {
  readonly manage: boolean
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const pause = useAgentPause(true)
  const [error, setError] = useState<string | undefined>()
  const change = useSubmit<boolean>(
    async (paused) => {
      const attempt = app.keys.begin(fingerprint.agentPause(paused))
      try {
        await app.agent.setPause(paused, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      setError(undefined)
      await refresh(app, 'agent')
      props.onDone(paused ? 'All Agents are paused.' : 'The Agents are running again.')
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentAgent(failure).message)
      },
    }
  )
  const paused = pause.data?.paused === true
  return (
    <Section
      id='pause'
      title='Pause all Agents'
      description='One switch for every Agent of your Organization.'
    >
      {error === undefined ? null : <Banner kind='error'>{error}</Banner>}
      {pause.isPending ? (
        <p role='status' className='notice'>
          Loading...
        </p>
      ) : pause.isError ? (
        <>
          <Banner kind='error'>{presentAgent(pause.error).message}</Banner>
          <button type='button' className='button' onClick={() => void pause.refetch()}>
            Try again
          </button>
        </>
      ) : (
        <div className='flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 border-y py-3'>
          <p className='m-0'>
            <strong>{paused ? 'Paused' : 'Running'}</strong>
            {paused && pause.data.updatedAt ? (
              <>
                {' '}
                since <When iso={pause.data.updatedAt} />
              </>
            ) : null}
          </p>
          {props.manage ? (
            paused ? (
              <button
                type='button'
                className='button'
                aria-disabled={change.pending}
                onClick={() => change.submit(false)}
              >
                {change.pending ? 'Resuming...' : 'Resume all Agents'}
              </button>
            ) : (
              <Confirm
                label='Pause all Agents'
                accessibleName='Pause all Agents'
                pendingAccessibleName='Pausing all Agents'
                pendingLabel='Pausing...'
                question='No Agent will place or answer anything until you resume them. The pause is recorded in the audit log.'
                confirmLabel='Pause all Agents'
                pending={change.pending}
                onConfirm={() => change.submit(true)}
              />
            )
          ) : null}
        </div>
      )}
    </Section>
  )
}
