import { type FormEvent, useRef, useState } from 'react'
import {
  emailSchema,
  type InvitableRole,
  type Invitation,
  invitableRoleSchema,
} from 'tula-closeline-contract'
import { dropInvitationKeys, fingerprint } from '~/api/idempotency'
import { presentManage } from '~/api/manage-messages'
import { useApp } from '~/app-context'
import { can, canRevokeInvitation, invitableRoles, ROLE_LABEL } from '~/data/permissions'
import { refresh, useInvitations } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { Banner } from '~/ui/Banner'
import { Confirm } from '~/ui/Confirm'
import { Field } from '~/ui/Field'
import { Paged } from '~/ui/Paged'
import { plain } from '~/ui/plain'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** A timestamp in the reader's own format, as a `<time>` element. */
export function When(props: { readonly iso: string }) {
  const date = new Date(props.iso)
  return Number.isNaN(date.getTime()) ? (
    <>Unknown</>
  ) : (
    <time dateTime={props.iso}>{DATE.format(date)}</time>
  )
}

/** The pending Invitations and the form to send one (Owner and Admin). */
export function InvitationsScreen() {
  useDocumentTitle('Invitations')
  const role = useRole()
  const allowed = role !== null && can.manageInvitations(role)
  const invitations = useInvitations(allowed)
  const [notice, setNotice] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  if (role === null) {
    return null
  }
  return (
    <>
      <h1 tabIndex={-1} ref={headingRef}>
        Invitations
      </h1>
      {allowed ? (
        <>
          <InviteForm role={role} onSent={setNotice} />
          <p role='status' className='notice'>
            {notice}
          </p>
          <h2>Pending Invitations</h2>
          <Paged
            noun='Invitations'
            emptyText='No Invitations are pending.'
            state={invitations.state}
          >
            <ScrollRegion label='Pending Invitations'>
              <table>
                <thead>
                  <tr>
                    <th scope='col'>Email address</th>
                    <th scope='col'>Role offered</th>
                    <th scope='col'>Expires</th>
                    <th scope='col'>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.items.map((invitation) => (
                    <InvitationRow
                      key={invitation.id}
                      invitation={invitation}
                      canRevoke={canRevokeInvitation(role, invitation.role)}
                      onDone={setNotice}
                      onRevoked={() => headingRef.current?.focus()}
                    />
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </Paged>
        </>
      ) : (
        <p>Your role cannot send or see Invitations. Ask an Owner or Admin.</p>
      )}
    </>
  )
}

function InviteForm(props: {
  readonly role: NonNullable<ReturnType<typeof useRole>>
  readonly onSent: (notice: string) => void
}) {
  const app = useApp()
  const offered = invitableRoles(props.role)
  const [email, setEmail] = useState('')
  const [offeredRole, setOfferedRole] = useState<InvitableRole>(offered.at(-1) ?? 'rep')
  const [errors, setErrors] = useState<{ email?: string; form?: string }>({})
  const emailInput = useRef<HTMLDivElement>(null)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()

  const send = useSubmit<{ email: string; role: InvitableRole }>(
    async (body) => {
      const attempt = app.keys.begin(fingerprint.invitation(body.email, body.role))
      try {
        await app.core.createInvitation(body, attempt.key)
      } catch (error) {
        attempt.failed(error)
        throw error
      }
      attempt.succeeded()
      setEmail('')
      setErrors({})
      await refresh(app, 'invitations')
      props.onSent('Invitation sent.')
      emailInput.current?.querySelector('input')?.focus()
    },
    {
      onError(error) {
        const shown = presentManage(error, 'invitation')
        setErrors(shown.field === 'email' ? { email: shown.message } : { form: shown.message })
        focusFirstError()
      },
    }
  )

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (send.pending) {
      return
    }
    const parsed = emailSchema.safeParse(email.trim())
    if (!parsed.success) {
      setErrors({ email: 'Enter a valid email address.' })
      focusFirstError()
      return
    }
    if (!invitableRoleSchema.safeParse(offeredRole).success || !offered.includes(offeredRole)) {
      setErrors({ form: 'Choose a role you can offer.' })
      focusFirstError()
      return
    }
    setErrors({})
    send.submit({ email: parsed.data, role: offeredRole })
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-labelledby='invite-heading'>
      <h2 id='invite-heading'>Invite someone</h2>
      {errors.form ? (
        <Banner kind='error' innerRef={bannerRef}>
          {errors.form}
        </Banner>
      ) : null}
      <div ref={emailInput}>
        <Field
          label='Email address'
          type='email'
          name='email'
          autoComplete='off'
          value={email}
          error={errors.email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <SelectField
        label='Role offered'
        name='role'
        value={offeredRole}
        options={offered.map((value) => ({ value, text: ROLE_LABEL[value] }))}
        onChange={(event) => setOfferedRole(event.target.value as InvitableRole)}
      />
      <div>
        <button type='submit' className='button' aria-disabled={send.pending}>
          {send.pending ? 'Sending...' : 'Send Invitation'}
        </button>
      </div>
    </form>
  )
}

function InvitationRow(props: {
  readonly invitation: Invitation
  readonly canRevoke: boolean
  readonly onDone: (notice: string) => void
  readonly onRevoked: () => void
}) {
  const { invitation } = props
  const app = useApp()
  const [error, setError] = useState<string | null>(null)
  const errorId = `${invitation.id}-error`
  const revoke = useSubmit<void>(
    async () => {
      setError(null)
      // Whatever was unsure about sending to this address (any role) is over: a later send is a new intent.
      dropInvitationKeys(app.keys, invitation.email)
      await app.core.revokeInvitation(invitation.id)
      await refresh(app, 'invitations')
      props.onDone('Invitation revoked.')
      props.onRevoked()
    },
    { onError: (failure) => setError(presentManage(failure, 'invitation').message) }
  )
  const label = plain(invitation.email, 'this address')
  const expired = Date.parse(invitation.expiresAt) < Date.now()
  return (
    <tr>
      <th scope='row'>
        <Untrusted value={invitation.email} />
      </th>
      <td>{ROLE_LABEL[invitation.role]}</td>
      <td>
        <When iso={invitation.expiresAt} />
        {expired ? <strong> (expired)</strong> : null}
      </td>
      <td>
        {props.canRevoke ? (
          <Confirm
            label='Revoke'
            accessibleName={`Revoke the Invitation for ${label}`}
            pendingAccessibleName={`Revoking the Invitation for ${label}`}
            pendingLabel='Revoking...'
            question={
              <>
                Revoke the Invitation for <Untrusted value={invitation.email} />? The link in the
                email stops working.
              </>
            }
            confirmLabel='Revoke Invitation'
            pending={revoke.pending}
            describedBy={error ? errorId : undefined}
            onConfirm={() => revoke.submit()}
          />
        ) : (
          <span className='hint'>Only an Owner can revoke this one.</span>
        )}
        {error ? (
          <p className='field-error' id={errorId} role='alert'>
            <strong>Error:</strong> {error}
          </p>
        ) : null}
      </td>
    </tr>
  )
}
