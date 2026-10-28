import { type FormEvent, useState } from 'react'
import {
  type CopilotSettings,
  MAX_COPILOT_MIN_EVIDENCE,
  MIN_COPILOT_MIN_EVIDENCE,
  setCopilotSettingsRequestSchema,
} from 'tula-closeline-contract'
import { MIN_EVIDENCE_WORDS, presentCopilot } from '~/api/copilot-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { can } from '~/data/permissions'
import { refresh, useCopilotSettings, useMembersByIds } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { plain } from '~/ui/plain'
import { SaveButton } from '~/ui/SaveButton'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

/** Whether Reps may choose the Copilot for a Call and how much Evidence a card needs: every role reads, Owner and Admin write. */
export function CopilotScreen() {
  useDocumentTitle('Copilot')
  const role = useRole()
  const settings = useCopilotSettings(role !== null)
  const by = settings.data?.updatedBy
  const names = useMembersByIds(by ? [by] : [], role !== null && can.viewMembers(role))
  if (role === null) {
    return null
  }
  const manage = can.manageCopilot(role)
  const who = by ? names.get(by) : undefined
  return (
    <>
      <PageHeader
        eyebrow='Sales'
        title='Copilot'
        description={
          manage
            ? 'Whether Reps may take the Copilot on a Call, and the least Evidence a card needs before it is shown.'
            : 'Whether Reps may take the Copilot on a Call, and the least Evidence a card needs. Only an Owner or Admin can change it.'
        }
      />
      <div className='flex flex-col gap-12'>
        <Section
          id='copilot-settings'
          title='Settings'
          description='The Copilot advises a Rep during a Call. It never starts before the AI and recording notice has played, and nothing here changes that notice.'
        >
          {settings.isPending ? (
            <p role='status' className='notice'>
              Loading the Copilot settings...
            </p>
          ) : settings.isError ? (
            <>
              <Banner kind='error'>{presentCopilot(settings.error).message}</Banner>
              <button type='button' className='button' onClick={() => void settings.refetch()}>
                Try again
              </button>
            </>
          ) : (
            <>
              {manage ? (
                <Form initial={settings.data} />
              ) : (
                <dl className='m-0 grid max-w-md grid-cols-[1fr_auto] gap-y-2'>
                  <dt>Copilot</dt>
                  <dd className='m-0'>{settings.data.enabled ? 'On' : 'Off'}</dd>
                  <dt>Fewest Moments behind a card</dt>
                  <dd className='m-0'>{settings.data.minMoments}</dd>
                  <dt>Fewest won Deals behind a card</dt>
                  <dd className='m-0'>{settings.data.minDeals}</dd>
                </dl>
              )}
              <p className='hint mt-4'>
                {settings.data.updatedAt ? (
                  <>
                    Last changed <When iso={settings.data.updatedAt} />
                    {who ? ` by ${plain(who.name ?? who.email, 'a member')}` : ''}
                  </>
                ) : (
                  'Never changed: the Copilot is off.'
                )}
              </p>
            </>
          )}
        </Section>
      </div>
    </>
  )
}

function Form(props: { readonly initial: CopilotSettings }) {
  const app = useApp()
  const { initial } = props
  const [enabled, setEnabled] = useState(initial.enabled)
  const [minMoments, setMinMoments] = useState(String(initial.minMoments))
  const [minDeals, setMinDeals] = useState(String(initial.minDeals))
  const [error, setError] = useState<string | undefined>()
  const [savedAt, setSavedAt] = useState(0)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const save = useSubmit(
    async (body: { enabled: boolean; minMoments: number; minDeals: number }) => {
      await app.voice.setCopilotSettings(body)
      setSavedAt(Date.now())
      await refresh(app, 'agent')
    },
    {
      onError(failure) {
        setError(presentCopilot(failure).message)
        focusFirstError()
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (save.pending) {
      return
    }
    const parsed = setCopilotSettingsRequestSchema.safeParse({
      enabled,
      minMoments: Number(minMoments),
      minDeals: Number(minDeals),
    })
    if (!parsed.success) {
      setError(MIN_EVIDENCE_WORDS)
      focusFirstError()
      return
    }
    setError(undefined)
    save.submit(parsed.data)
  }
  const hint = `From ${MIN_COPILOT_MIN_EVIDENCE} to ${MAX_COPILOT_MIN_EVIDENCE}.`
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className='max-w-none gap-0'>
      {error === undefined ? null : (
        <Banner kind='error' innerRef={bannerRef}>
          {error}
        </Banner>
      )}
      <label className='mb-6 flex items-start gap-2'>
        <input
          type='checkbox'
          className='mt-1'
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span>
          Let Reps use the Copilot
          <span className='hint block'>Off by default. Reps choose it per Call when it is on.</span>
        </span>
      </label>
      <Field
        label='Fewest Moments behind a card'
        name='min-moments'
        type='number'
        inputMode='numeric'
        hint={hint}
        value={minMoments}
        onChange={(event) => setMinMoments(event.target.value)}
      />
      <Field
        label='Fewest won Deals behind a card'
        name='min-deals'
        type='number'
        inputMode='numeric'
        hint={`${hint} No more than the Moments.`}
        value={minDeals}
        onChange={(event) => setMinDeals(event.target.value)}
      />
      <div className='row-actions'>
        <SaveButton pending={save.pending} savedAt={savedAt} pendingLabel='Saving...'>
          Save settings
        </SaveButton>
      </div>
    </form>
  )
}
