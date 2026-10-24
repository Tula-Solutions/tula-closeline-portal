import { type FormEvent, useState } from 'react'
import {
  ALWAYS_HELD_REASONS,
  type ApprovalPolicy,
  type ApprovalRule,
  approvalRuleSchema,
  type DraftHoldReason,
  INBOX_CHANNELS,
  type InboxChannel,
  MAX_EXCEPT_LABELS,
  REPLY_LABELS,
  type ReplyLabel,
} from 'tula-closeline-contract'
import { presentInbox } from '~/api/inbox-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { can } from '~/data/permissions'
import { refresh, useApprovalPolicies } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { CHANNEL_WORD, LABEL_WORD } from '~/screens/inbox/words'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { SubmitButton } from '~/ui/SubmitButton'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFeedback } from '~/ui/useFeedback'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

const MODE_WORD = {
  always: 'Every Draft needs approval',
  below_confidence: 'Only when confidence is below',
  except: 'Every Draft except replies labelled',
} as const

const HELD_WORD: Record<DraftHoldReason, string> = {
  policy: 'Drafts your rule above holds.',
  ungrounded: 'Drafts that cite no Playbook source.',
  check_failed: 'Drafts when a check fails.',
  escalated: 'Drafts for Prospects who need a person.',
  first_message: 'The first message to a Prospect.',
}

/** When the Agent's Drafts wait for a person, set per channel; Owners and Admins only. */
export function ApprovalPolicyScreen() {
  useDocumentTitle('Approval policy')
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.manageApprovalPolicy(role)) {
    return (
      <>
        <PageHeader eyebrow='Sales' title='Approval policy' />
        <p role='status' className='notice'>
          Only an Owner or Admin can set the approval policy. Ask one of them if a rule should
          change.
        </p>
      </>
    )
  }
  return <PolicyAdmin />
}

function PolicyAdmin() {
  const policies = useApprovalPolicies(true)
  const feedback = useFeedback()
  return (
    <>
      <PageHeader
        eyebrow='Sales'
        title='Approval policy'
        description='Choose, for each channel, which of the Agent’s replies wait for a person before they are sent.'
      />
      <div className='flex flex-col gap-10'>
        <p role='status' className='notice'>
          {feedback.notice}
        </p>
        {policies.isPending ? (
          <p role='status' className='notice'>
            Loading the policy...
          </p>
        ) : policies.isError ? (
          <>
            <Banner kind='error'>{presentInbox(policies.error).message}</Banner>
            <button type='button' className='button' onClick={() => void policies.refetch()}>
              Try again
            </button>
          </>
        ) : (
          INBOX_CHANNELS.map((channel) => {
            const policy = policies.data.items.find((item) => item.channel === channel)
            const rule: ApprovalRule = policy?.rule ?? { mode: 'always' }
            return (
              <ChannelForm
                key={`${channel}:${JSON.stringify(rule)}`}
                channel={channel}
                rule={rule}
                policy={policy}
                onDone={feedback.done}
                onFail={feedback.failed}
              />
            )
          })
        )}
        <Section
          id='always-held'
          title='Always held for a person'
          description='These wait for a person whatever the rules say. There is no setting to turn them off.'
        >
          <ul className='m-0 list-none divide-y border-y p-0'>
            {ALWAYS_HELD_REASONS.map((reason) => (
              <li key={reason} className='py-2'>
                {HELD_WORD[reason]}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  )
}

function ChannelForm(props: {
  readonly channel: InboxChannel
  readonly rule: ApprovalRule
  readonly policy: ApprovalPolicy | undefined
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const { channel } = props
  const app = useApp()
  const name = CHANNEL_WORD[channel]
  const [mode, setMode] = useState<ApprovalRule['mode']>(props.rule.mode)
  const [threshold, setThreshold] = useState(
    props.rule.mode === 'below_confidence' ? String(props.rule.threshold) : '0.8'
  )
  const [labels, setLabels] = useState<readonly ReplyLabel[]>(
    props.rule.mode === 'except' ? props.rule.labels : []
  )
  const [error, setError] = useState<string | undefined>()
  const [fieldError, setFieldError] = useState<string | undefined>()
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const save = useSubmit<ApprovalRule>(
    async (rule) => {
      // A PUT of the same rule is the same change, so a repeat needs no key.
      await app.approvals.setPolicy(channel, rule)
      await refresh(app, 'inbox')
      props.onDone(`${name} saved.`)
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentInbox(failure).message)
        focusFirstError()
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (save.pending) {
      return
    }
    props.onFail()
    setError(undefined)
    setFieldError(undefined)
    const candidate =
      mode === 'always'
        ? { mode }
        : mode === 'below_confidence'
          ? { mode, threshold: threshold.trim() === '' ? Number.NaN : Number(threshold) }
          : { mode, labels: [...labels] }
    const parsed = approvalRuleSchema.safeParse(candidate)
    if (!parsed.success) {
      setFieldError(
        mode === 'below_confidence'
          ? 'Enter a number between 0 and 1, above 0, such as 0.8.'
          : `Choose between 1 and ${MAX_EXCEPT_LABELS} labels.`
      )
      focusFirstError()
      return
    }
    save.submit(parsed.data)
  }
  const toggle = (label: ReplyLabel, on: boolean) =>
    setLabels((now) => (on ? [...now, label] : now.filter((item) => item !== label)))
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
            {(['always', 'below_confidence', 'except'] as const).map((choice) => (
              <label key={choice} className='flex items-center gap-2'>
                <input
                  type='radio'
                  name={`mode-${channel}`}
                  checked={mode === choice}
                  onChange={() => setMode(choice)}
                />
                {MODE_WORD[choice]}
              </label>
            ))}
          </div>
          {mode === 'below_confidence' ? (
            <Field
              label='Confidence threshold'
              hint='Drafts the Agent is less sure of than this wait. 1 means all of them.'
              inputMode='decimal'
              value={threshold}
              error={fieldError}
              onChange={(event) => setThreshold(event.target.value)}
            />
          ) : null}
          {mode === 'except' ? (
            <fieldset className='scope-fieldset mb-4 border-0 p-0'>
              <legend className='label-mono mb-2'>Replies that may go without approval</legend>
              {fieldError === undefined ? null : (
                <p className='text-sm text-danger' aria-invalid='true' tabIndex={-1}>
                  <strong>Error:</strong> {fieldError}
                </p>
              )}
              {REPLY_LABELS.map((label) => (
                <label key={label} className='flex items-center gap-2'>
                  <input
                    type='checkbox'
                    checked={labels.includes(label)}
                    onChange={(event) => toggle(label, event.target.checked)}
                  />
                  {LABEL_WORD[label]}
                </label>
              ))}
            </fieldset>
          ) : null}
          <SubmitButton pending={save.pending}>Save {name}</SubmitButton>
        </div>
      </fieldset>
    </form>
  )
}
