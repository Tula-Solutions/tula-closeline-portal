import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { Mailbox, MailboxProvider } from 'tula-closeline-contract'
import { fingerprint } from '~/api/idempotency'
import { presentMail, STATE_REASON } from '~/api/mail-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { refreshMail, useMailboxes, useOrganizationMailLimits } from '~/data/mail-queries'
import { can } from '~/data/permissions'
import { useRole } from '~/data/session-role'
import { MailboxDetails } from '~/screens/mail/MailboxDetails'
import { Banner } from '~/ui/Banner'
import { Confirm } from '~/ui/Confirm'
import { Paged } from '~/ui/Paged'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useClearOnSuccess, useFeedback } from '~/ui/useFeedback'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

/** What the provider put in the return address: the one-time code and the `state` from the start, or a refusal. */
export type MailboxReturn = {
  readonly code?: string | undefined
  readonly state?: string | undefined
  readonly error?: string | undefined
}

const STATE_WORD = {
  warming: 'Warming up',
  healthy: 'Healthy',
  limited: 'Limited',
  paused: 'Paused',
  disconnected: 'Disconnected',
} as const

const PROVIDER_WORD = { gmail: 'Gmail', outlook: 'Outlook' } as const

const hasReturn = (returned: MailboxReturn | undefined) =>
  returned !== undefined &&
  (returned.code !== undefined || returned.state !== undefined || returned.error !== undefined)

/** Where a Rep connects the Mailboxes Closeline sends from, and sees their limits, ramp, health and domain check. */
export function MailboxesScreen(props: { readonly returned?: MailboxReturn | undefined }) {
  useDocumentTitle('Mailboxes')
  const feedback = useFeedback()
  const mailboxes = useMailboxes()
  const ceilings = useOrganizationMailLimits()
  const role = useRole()
  if (role === null) {
    return null
  }
  return (
    <>
      <PageHeader
        eyebrow='Sales'
        title='Mailboxes'
        description='The email accounts Closeline sends from. Each has its own daily and hourly limits, a ramp for a new one, and a health score that pauses it before it hurts your sending name.'
      />
      <div className='flex flex-col gap-12'>
        <p role='status' className='notice'>
          {feedback.notice}
        </p>
        <ConnectSection
          returned={props.returned}
          canShare={can.manageMail(role)}
          onDone={feedback.done}
          onFail={feedback.failed}
        />
        <Section id='mailboxes' title='Your Mailboxes'>
          <Paged
            noun='Mailboxes'
            emptyText='No Mailbox is connected yet.'
            emptyHint='Connect one above to start sending.'
            state={mailboxes.state}
            present={presentMail}
          >
            <ul className='m-0 list-none divide-y border-y p-0' aria-label='Mailboxes'>
              {mailboxes.items.map((mailbox) => (
                <MailboxItem
                  key={mailbox.id}
                  mailbox={mailbox}
                  ceilings={ceilings.data}
                  role={role}
                  onDone={feedback.done}
                  onFail={feedback.failed}
                  serial={feedback.serial}
                />
              ))}
            </ul>
          </Paged>
        </Section>
      </div>
    </>
  )
}

function ConnectSection(props: {
  readonly returned: MailboxReturn | undefined
  readonly canShare: boolean
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const navigate = useNavigate()
  const [provider, setProvider] = useState<MailboxProvider>('gmail')
  const [kind, setKind] = useState<'personal' | 'shared'>('personal')
  const [error, setError] = useState<string | undefined>()
  const handled = useRef(false)
  const finish = useSubmit<{ readonly state: string; readonly code: string }>(
    async (body) => {
      const attempt = app.keys.begin(fingerprint.mailboxComplete(body.state))
      try {
        await app.outbound.completeConnect(body, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      setError(undefined)
      await refreshMail(app)
      props.onDone('The Mailbox is connected.')
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentMail(failure).message)
      },
    }
  )
  const start = useSubmit<undefined>(
    async () => {
      const attempt = app.keys.begin(fingerprint.mailboxStart(provider, kind))
      let address: string
      try {
        address = (await app.outbound.startConnect(provider, kind, attempt.key)).authorizationUrl
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      const { protocol } = new URL(address)
      // The local fake provider is plain http; every real one must be https.
      if (protocol !== 'https:' && !(protocol === 'http:' && app.env.environment === 'local')) {
        throw new Error('unsafe consent address')
      }
      setError(undefined)
      app.assign(address)
    },
    {
      onError(failure) {
        props.onFail()
        setError(
          failure instanceof Error && failure.message === 'unsafe consent address'
            ? 'The email provider sent an address Closeline will not open. Try again later.'
            : presentMail(failure).message
        )
      },
    }
  )

  // The return from the provider: take the code and state out of the address at once, then complete.
  const { returned } = props
  const { submit: complete } = finish
  useEffect(() => {
    if (handled.current || !hasReturn(returned)) {
      return
    }
    handled.current = true
    void navigate({ to: '/mailboxes/connect/callback', search: {}, replace: true })
    if (returned?.code && returned.state) {
      complete({ state: returned.state, code: returned.code })
    } else {
      setError('The email provider did not allow access, so no Mailbox was connected.')
    }
  }, [returned, navigate, complete])

  return (
    <Section
      id='connect'
      title='Connect a Mailbox'
      description='You sign in with Gmail or Outlook and allow Closeline to send and read replies. Closeline never shows or stores your password.'
    >
      {error === undefined ? null : <Banner kind='error'>{error}</Banner>}
      <div className='flex flex-wrap items-end gap-x-6'>
        <SelectField
          label='Email provider'
          name='provider'
          options={[
            { value: 'gmail', text: PROVIDER_WORD.gmail },
            { value: 'outlook', text: PROVIDER_WORD.outlook },
          ]}
          value={provider}
          onChange={(event) => setProvider(event.target.value === 'outlook' ? 'outlook' : 'gmail')}
        />
        {props.canShare ? (
          <SelectField
            label='Whose Mailbox'
            name='kind'
            options={[
              { value: 'personal', text: 'Mine' },
              { value: 'shared', text: 'Shared by the Organization' },
            ]}
            value={kind}
            onChange={(event) => setKind(event.target.value === 'shared' ? 'shared' : 'personal')}
          />
        ) : null}
        <div className='mb-4'>
          <button
            type='button'
            className='button'
            aria-disabled={start.pending || finish.pending}
            onClick={() => start.submit(undefined)}
          >
            {start.pending
              ? 'Opening the provider...'
              : finish.pending
                ? 'Connecting...'
                : `Connect ${PROVIDER_WORD[provider]}`}
          </button>
        </div>
      </div>
    </Section>
  )
}

function MailboxItem(props: {
  readonly mailbox: Mailbox
  readonly ceilings: ReturnType<typeof useOrganizationMailLimits>['data']
  readonly role: Parameters<typeof can.manageMail>[0]
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
  readonly serial: number
}) {
  const app = useApp()
  const { mailbox, role } = props
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | undefined>()
  useClearOnSuccess(props.serial, () => setError(undefined))
  const fail = (failure: unknown) => {
    props.onFail()
    setError(presentMail(failure).message)
  }
  const pause = useSubmit<undefined>(
    async () => {
      await app.outbound.pause(mailbox.id)
      setError(undefined)
      await refreshMail(app)
      props.onDone('The Mailbox is paused.')
    },
    { onError: fail }
  )
  const resume = useSubmit<undefined>(
    async () => {
      await app.outbound.resume(mailbox.id)
      setError(undefined)
      await refreshMail(app)
      props.onDone('The Mailbox is sending again.')
    },
    { onError: fail }
  )
  const disconnect = useSubmit<undefined>(
    async () => {
      const attempt = app.keys.begin(fingerprint.mailboxDisconnect(mailbox.id))
      try {
        await app.outbound.disconnect(mailbox.id, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      setError(undefined)
      await refreshMail(app)
      props.onDone('The Mailbox is disconnected.')
    },
    { onError: fail }
  )
  const reason = mailbox.stateReason === null ? undefined : STATE_REASON[mailbox.stateReason]
  const held =
    mailbox.state === 'paused' || mailbox.state === 'limited' || mailbox.state === 'disconnected'
  const canResume =
    mailbox.state === 'paused' &&
    (reason === undefined || !reason.needsAdmin || can.manageMail(role))
  const { effectiveLimits: effective, limits, ramp } = mailbox
  const cut = effective.perDay !== limits.perDay || effective.perHour !== limits.perHour
  const detailsId = `${mailbox.id}-details`
  return (
    <li className='py-4'>
      <div className='list-item-head'>
        <p className='m-0'>
          <strong>
            <Untrusted value={mailbox.address} />
          </strong>{' '}
          <span className='label-mono'>
            {PROVIDER_WORD[mailbox.provider]} · {mailbox.kind === 'shared' ? 'Shared' : 'Personal'}
          </span>
          <span className='hint block'>
            <strong>{STATE_WORD[mailbox.state]}</strong>
            {' · '}
            Sends up to {effective.perDay} a day and {effective.perHour} an hour
            {cut ? ` (set to ${limits.perDay} and ${limits.perHour}; cut while it recovers)` : ''}
            {mailbox.lastSyncedAt === null ? null : (
              <>
                , last synced <When iso={mailbox.lastSyncedAt} />
              </>
            )}
          </span>
          {ramp.active ? (
            <span className='hint block'>
              Warming up: day {ramp.dayIndex}, sending {ramp.perDayNow} a day for now, rising to{' '}
              {limits.perDay}.
            </span>
          ) : null}
        </p>
        <div className='row-actions'>
          <button
            type='button'
            className='button button-quiet'
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen(!open)}
          >
            {open ? 'Hide details' : 'Limits, health and domain'}
          </button>
          {mailbox.state === 'healthy' || mailbox.state === 'warming' ? (
            <button
              type='button'
              className='button button-quiet'
              aria-disabled={pause.pending}
              onClick={() => pause.submit(undefined)}
            >
              {pause.pending ? 'Pausing...' : 'Pause'}
            </button>
          ) : null}
          {canResume ? (
            <button
              type='button'
              className='button'
              aria-disabled={resume.pending}
              onClick={() => resume.submit(undefined)}
            >
              {resume.pending ? 'Resuming...' : 'Resume'}
            </button>
          ) : null}
          {mailbox.state === 'disconnected' ? null : (
            <Confirm
              label='Disconnect'
              accessibleName={`Disconnect ${mailbox.address}`}
              pendingAccessibleName={`Disconnecting ${mailbox.address}`}
              pendingLabel='Disconnecting...'
              question='Closeline stops sending from this Mailbox and drops its access. Sends already made stay in the send log. Campaigns that use it send from another Mailbox, or wait.'
              confirmLabel='Disconnect Mailbox'
              pending={disconnect.pending}
              onConfirm={() => disconnect.submit(undefined)}
              tone='quiet-destructive'
            />
          )}
        </div>
      </div>
      {error === undefined ? null : <Banner kind='error'>{error}</Banner>}
      {held && reason !== undefined ? (
        <Banner kind='warning' className='mt-3'>
          <strong>{STATE_WORD[mailbox.state]}.</strong> {reason.why} {reason.todo}
        </Banner>
      ) : null}
      {open ? (
        <div id={detailsId}>
          <MailboxDetails
            mailbox={mailbox}
            ceilings={props.ceilings}
            canCheckDomain={can.manageMail(role)}
            onDone={props.onDone}
          />
        </div>
      ) : null}
    </li>
  )
}
