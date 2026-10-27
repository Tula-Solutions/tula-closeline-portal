import { type FormEvent, useState } from 'react'
import {
  ESCALATION_TARGETS,
  ESCALATION_TRIGGERS,
  type EscalationRule,
  type EscalationRuleRequest,
  type EscalationTarget,
  type EscalationTrigger,
} from '~/api/escalation'
import { presentInbox } from '~/api/inbox-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { can } from '~/data/permissions'
import { refresh, useEscalationRules, useTeamOptions } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { TARGET_WORD, TRIGGER_WORD } from '~/screens/inbox/words'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { plain } from '~/ui/plain'
import { SelectField } from '~/ui/SelectField'
import { SubmitButton } from '~/ui/SubmitButton'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFeedback } from '~/ui/useFeedback'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

/** Where a Conversation that needs a person goes, set per trigger; Owners and Admins only. */
export function EscalationRulesScreen() {
  useDocumentTitle('Escalation rules')
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.manageEscalationRules(role)) {
    return (
      <>
        <PageHeader eyebrow='Sales' title='Escalation rules' />
        <p role='status' className='notice'>
          Only an Owner or Admin can set the escalation rules. Ask one of them if a rule should
          change.
        </p>
      </>
    )
  }
  return <RulesAdmin />
}

function RulesAdmin() {
  const rules = useEscalationRules(true)
  const teams = useTeamOptions(true)
  const feedback = useFeedback()
  return (
    <>
      <PageHeader
        eyebrow='Sales'
        title='Escalation rules'
        description='Choose, for each trigger, who gets the Conversation when the Agent hands it to a person.'
      />
      <div className='flex flex-col gap-10'>
        <p role='status' className='notice'>
          {feedback.notice}
        </p>
        {rules.isPending ? (
          <p role='status' className='notice'>
            Loading the rules...
          </p>
        ) : rules.isError ? (
          <>
            <Banner kind='error'>{presentInbox(rules.error).message}</Banner>
            <button type='button' className='button' onClick={() => void rules.refetch()}>
              Try again
            </button>
          </>
        ) : (
          <>
            {ESCALATION_TRIGGERS.map((trigger) => {
              const rule = rules.data.items.find((item) => item.trigger === trigger)
              return (
                <TriggerForm
                  key={`${trigger}:${rule?.updatedAt ?? 'none'}`}
                  trigger={trigger}
                  rule={rule}
                  teams={teams.items}
                  onDone={feedback.done}
                  onFail={feedback.failed}
                />
              )
            })}
            <p className='text-sm text-muted-foreground'>
              A Conversation the Agent could not write a reply for goes to the Admin queue when no
              rule is set for that trigger.
            </p>
          </>
        )}
      </div>
    </>
  )
}

function TriggerForm(props: {
  readonly trigger: EscalationTrigger
  readonly rule: EscalationRule | undefined
  readonly teams: readonly { readonly id: string; readonly name?: string | null }[]
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const { trigger, rule } = props
  const app = useApp()
  const name = TRIGGER_WORD[trigger]
  const [target, setTarget] = useState<EscalationTarget>(rule?.target ?? 'admin_queue')
  const [teamId, setTeamId] = useState(rule?.teamId ?? '')
  const [threshold, setThreshold] = useState(String(rule?.threshold ?? 0.5))
  const [enabled, setEnabled] = useState(rule?.enabled ?? true)
  const [error, setError] = useState<string | undefined>()
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [teamError, setTeamError] = useState<string | undefined>()
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const fail = (failure: unknown) => {
    props.onFail()
    setError(presentInbox(failure).message)
    focusFirstError()
  }
  const save = useSubmit<EscalationRuleRequest>(
    async (request) => {
      // A PUT of the same rule is the same change, so a repeat needs no key.
      await app.escalation.setRule(trigger, request)
      await refresh(app, 'inbox')
      props.onDone('Rule saved.')
    },
    { onError: fail }
  )
  const remove = useSubmit<void>(
    async () => {
      await app.escalation.deleteRule(trigger)
      await refresh(app, 'inbox')
      props.onDone('Rule removed.')
    },
    { onError: fail }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (save.pending) {
      return
    }
    props.onFail()
    setError(undefined)
    setFieldError(undefined)
    setTeamError(undefined)
    const number = Number(threshold)
    const badThreshold =
      trigger === 'low_confidence' && (threshold.trim() === '' || !(number > 0 && number <= 1))
    const noTeam = target === 'team_round_robin' && teamId === ''
    if (badThreshold || noTeam) {
      setFieldError(badThreshold ? 'Enter a number above 0 and up to 1, such as 0.5.' : undefined)
      setTeamError(noTeam ? 'Choose the Team.' : undefined)
      focusFirstError()
      return
    }
    save.submit({
      target,
      enabled,
      ...(target === 'team_round_robin' ? { teamId } : {}),
      ...(trigger === 'low_confidence' ? { threshold: number } : {}),
    })
  }
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate>
      <fieldset className='scope-fieldset m-0 min-w-0 border-t border-rule-strong p-0 pt-4'>
        <legend className='float-left mb-4 w-full font-display text-xl'>{name}</legend>
        <div className='clear-both'>
          {error === undefined ? null : (
            <Banner kind='error' innerRef={bannerRef}>
              {error}
            </Banner>
          )}
          <div className='mb-4 flex flex-col gap-2'>
            {ESCALATION_TARGETS.map((choice) => (
              <label key={choice} className='flex items-center gap-2'>
                <input
                  type='radio'
                  name={`target-${trigger}`}
                  checked={target === choice}
                  onChange={() => setTarget(choice)}
                />
                {TARGET_WORD[choice]}
              </label>
            ))}
          </div>
          {target === 'team_round_robin' ? (
            <SelectField
              label='Team'
              value={teamId}
              placeholder='Choose a Team'
              error={teamError}
              options={props.teams.map((team) => ({
                value: team.id,
                text: plain(team.name ?? team.id),
              }))}
              onChange={(event) => setTeamId(event.target.value)}
            />
          ) : null}
          {trigger === 'low_confidence' ? (
            <Field
              label='Confidence threshold'
              hint='Conversations the Agent is less sure of than this go to the target. 1 means all of them.'
              inputMode='decimal'
              value={threshold}
              error={fieldError}
              onChange={(event) => setThreshold(event.target.value)}
            />
          ) : null}
          <label className='mb-4 flex items-center gap-2'>
            <input
              type='checkbox'
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            This rule is on
          </label>
          <div className='flex items-center gap-4'>
            <SubmitButton pending={save.pending}>Save rule</SubmitButton>
            {rule === undefined ? null : (
              <button
                type='button'
                className='button'
                disabled={remove.pending}
                onClick={() => {
                  props.onFail()
                  setError(undefined)
                  remove.submit()
                }}
              >
                Remove rule
              </button>
            )}
          </div>
        </div>
      </fieldset>
    </form>
  )
}
