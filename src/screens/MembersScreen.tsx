import { Link } from '@tanstack/react-router'
import { useCallback, useRef, useState } from 'react'
import type { Member, Role } from 'tula-closeline-contract'
import { presentManage } from '~/api/manage-messages'
import { useApp } from '~/app-context'
import { EmptyState } from '~/components/app/empty-state'
import { PageHeader } from '~/components/app/page-header'
import { RoleBadge } from '~/components/app/role-badge'
import { Monogram } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import { NativeSelect } from '~/components/ui/native-select'
import { assignableRoles, can, canRemoveMember, ROLE_LABEL } from '~/data/permissions'
import { refresh, useMembers } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { cn } from '~/lib/utils'
import { Confirm } from '~/ui/Confirm'
import { Paged } from '~/ui/Paged'
import { plain } from '~/ui/plain'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useClearOnSuccess, useFeedback } from '~/ui/useFeedback'
import { useSubmit } from '~/ui/useSubmit'

/** The members of the Organization: name (or email address), email address, role; Owners and Admins change roles and remove members. */
export function MembersScreen() {
  useDocumentTitle('Members')
  const role = useRole()
  const allowed = role !== null && can.viewMembers(role)
  const members = useMembers(allowed)
  const feedback = useFeedback()
  const headingRef = useRef<HTMLHeadingElement>(null)
  if (role === null) {
    return null
  }
  return (
    <>
      <PageHeader
        eyebrow='Organization'
        title='Members'
        description='Everyone in your Organization and the role they hold.'
        headingRef={headingRef}
        headingProps={{ tabIndex: -1 }}
        actions={
          can.manageInvitations(role) ? (
            <Button asChild>
              <Link to='/invitations'>Invite people</Link>
            </Button>
          ) : null
        }
      />
      {allowed ? (
        <div className='page-stack'>
          <p role='status' className='notice'>
            {feedback.notice}
          </p>
          <Paged
            noun='members'
            emptyText='There are no members to show.'
            emptyHint='People appear here once they accept an Invitation.'
            state={members.state}
          >
            <ScrollRegion label='Members'>
              <table className='ledger-stack'>
                <thead>
                  <tr>
                    <th scope='col'>Member</th>
                    <th scope='col'>Email address</th>
                    <th scope='col'>Role</th>
                    {can.manageMembers(role) ? (
                      <th scope='col' className='w-0 text-end'>
                        Actions
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {members.items.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      viewerRole={role}
                      onDone={feedback.done}
                      onFail={feedback.failed}
                      serial={feedback.serial}
                      onRemoved={() => headingRef.current?.focus()}
                    />
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </Paged>
        </div>
      ) : (
        <EmptyState title='Members are visible to Owners, Admins and Managers'>
          Your role cannot see the list of members. Ask an Owner or Admin if you need it.
        </EmptyState>
      )}
    </>
  )
}

function MemberRow(props: {
  readonly member: Member
  readonly viewerRole: Role
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
  readonly serial: number
  readonly onRemoved: () => void
}) {
  const { member, viewerRole } = props
  const app = useApp()
  const [selected, setSelected] = useState<Role>(member.role)
  // The role can change under us (another Admin, a refetch): follow it instead of keeping a stale choice.
  const [seenRole, setSeenRole] = useState<Role>(member.role)
  if (seenRole !== member.role) {
    setSeenRole(member.role)
    setSelected(member.role)
  }
  const [error, setError] = useState<string | null>(null)
  const select = useRef<HTMLSelectElement>(null)
  const errorId = `${member.id}-error`
  const choices = assignableRoles(viewerRole, member.role)
  const clearError = useCallback(() => setError(null), [])
  useClearOnSuccess(props.serial, clearError)
  const onError = (failure: unknown) => {
    props.onFail()
    setError(presentManage(failure).message)
  }

  const change = useSubmit<Role>(
    async (next) => {
      setError(null)
      await app.core.changeMemberRole(member.id, next)
      await refresh(app, 'members')
      props.onDone('Role updated.')
      select.current?.focus()
    },
    { onError }
  )
  const remove = useSubmit<void>(
    async () => {
      setError(null)
      await app.core.removeMember(member.id)
      await refresh(app, 'members')
      props.onDone('Member removed.')
      props.onRemoved()
    },
    {
      onError: (failure) => {
        // The row is as it was: an unsaved role choice does not stay behind.
        setSelected(member.role)
        onError(failure)
      },
    }
  )

  const display = member.name ?? member.email
  const label = plain(member.name ?? '', plain(member.email, 'member'))
  const manage = can.manageMembers(viewerRole)
  return (
    <>
      <tr>
        <th scope='row' className='font-normal'>
          <div className='flex min-w-0 items-baseline'>
            <Monogram name={display} />
            <span className='min-w-0 text-[0.9375rem] font-medium'>
              <Untrusted value={display} />
            </span>
          </div>
        </th>
        <td
          className={cn(
            'font-mono text-[0.8125rem] text-muted-foreground',
            // With no separate name the address is already the row's heading: on a phone, say it once.
            member.name === null && 'max-sm:hidden'
          )}
        >
          <Untrusted value={member.email} />
        </td>
        <td className={manage ? 'ledger-pair' : undefined}>
          {manage && choices.length > 0 ? (
            <div className='flex flex-nowrap items-center gap-4'>
              <label className='sr-only' htmlFor={`${member.id}-role`}>
                Role for {label}
              </label>
              <NativeSelect
                id={`${member.id}-role`}
                ref={select}
                controlSize='inline'
                className='min-w-[6.5rem]'
                value={selected}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => setSelected(event.target.value as Role)}
              >
                {choices.map((choice) => (
                  <option key={choice} value={choice}>
                    {ROLE_LABEL[choice]}
                  </option>
                ))}
              </NativeSelect>
              {selected !== member.role ? (
                <Button
                  type='button'
                  size='sm'
                  className='motion-safe:animate-fade'
                  aria-disabled={change.pending}
                  aria-label={`Save role for ${label}`}
                  onClick={() => change.submit(selected)}
                >
                  {change.pending ? 'Saving...' : 'Save role'}
                </Button>
              ) : null}
            </div>
          ) : (
            <RoleBadge value={member.role} />
          )}
        </td>
        {manage ? (
          <td className='ledger-pair'>
            <div className='row-actions flex-nowrap justify-end'>
              {canRemoveMember(viewerRole, member.role) ? (
                <Confirm
                  tone='quiet-destructive'
                  label='Remove'
                  accessibleName={`Remove ${label}`}
                  pendingAccessibleName={`Removing ${label}`}
                  pendingLabel='Removing...'
                  question={
                    <>
                      Remove <Untrusted value={display} /> from your Organization? They lose access
                      at once.
                    </>
                  }
                  confirmLabel='Remove member'
                  pending={remove.pending}
                  describedBy={error ? errorId : undefined}
                  onConfirm={() => remove.submit()}
                />
              ) : null}
            </div>
          </td>
        ) : null}
      </tr>
      {error ? (
        // Its own row: an error inside the Actions cell widened it and squeezed the other columns.
        <tr>
          <td colSpan={manage ? 4 : 3}>
            <p className='field-error' id={errorId} role='alert'>
              <strong>Error:</strong> {error}
            </p>
          </td>
        </tr>
      ) : null}
    </>
  )
}
