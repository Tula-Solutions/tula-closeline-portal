import { useRef, useState } from 'react'
import type { Member, Role } from 'tula-closeline-contract'
import { presentManage } from '~/api/manage-messages'
import { useApp } from '~/app-context'
import { assignableRoles, can, canRemoveMember, ROLE_LABEL } from '~/data/permissions'
import { KEYS, useMembers } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { Confirm } from '~/ui/Confirm'
import { Paged } from '~/ui/Paged'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useSubmit } from '~/ui/useSubmit'

/** The members of the Organization: name (or email address), email address, role; Owners and Admins change roles and remove members. */
export function MembersScreen() {
  useDocumentTitle('Members')
  const role = useRole()
  const allowed = role !== null && can.viewMembers(role)
  const members = useMembers(allowed)
  const [notice, setNotice] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  if (role === null) {
    return null
  }
  return (
    <>
      <h1 tabIndex={-1} ref={headingRef}>
        Members
      </h1>
      {allowed ? (
        <>
          <p role='status' className='notice'>
            {notice}
          </p>
          <Paged noun='members' emptyText='There are no members to show.' state={members.state}>
            <ScrollRegion label='Members'>
              <table>
                <thead>
                  <tr>
                    <th scope='col'>Name</th>
                    <th scope='col'>Email address</th>
                    <th scope='col'>Role</th>
                    {can.manageMembers(role) ? <th scope='col'>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {members.items.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      viewerRole={role}
                      onDone={setNotice}
                      onRemoved={() => headingRef.current?.focus()}
                    />
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </Paged>
        </>
      ) : (
        <p>Your role cannot see the list of members. Ask an Owner or Admin if you need it.</p>
      )}
    </>
  )
}

function MemberRow(props: {
  readonly member: Member
  readonly viewerRole: Role
  readonly onDone: (notice: string) => void
  readonly onRemoved: () => void
}) {
  const { member, viewerRole } = props
  const app = useApp()
  const [selected, setSelected] = useState<Role>(member.role)
  const [error, setError] = useState<string | null>(null)
  const select = useRef<HTMLSelectElement>(null)
  const errorId = `${member.id}-error`
  const choices = assignableRoles(viewerRole, member.role)
  const onError = (failure: unknown) => setError(presentManage(failure).message)

  const change = useSubmit<Role>(
    async (next) => {
      setError(null)
      await app.core.changeMemberRole(member.id, next)
      await app.queryClient.invalidateQueries({ queryKey: KEYS.members })
      props.onDone('Role updated.')
      select.current?.focus()
    },
    { onError }
  )
  const remove = useSubmit<void>(
    async () => {
      setError(null)
      await app.core.removeMember(member.id)
      await app.queryClient.invalidateQueries({ queryKey: KEYS.members })
      props.onDone('Member removed.')
      props.onRemoved()
    },
    { onError }
  )

  const display = member.name ?? member.email
  return (
    <tr>
      <th scope='row'>
        <Untrusted value={display} />
      </th>
      <td>
        <Untrusted value={member.email} />
      </td>
      <td>{ROLE_LABEL[member.role]}</td>
      {can.manageMembers(viewerRole) ? (
        <td>
          <div className='row-actions'>
            {choices.length > 0 ? (
              <>
                <label className='sr-only' htmlFor={`${member.id}-role`}>
                  Role for {display}
                </label>
                <select
                  id={`${member.id}-role`}
                  ref={select}
                  value={selected}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(event) => setSelected(event.target.value as Role)}
                >
                  {choices.map((choice) => (
                    <option key={choice} value={choice}>
                      {ROLE_LABEL[choice]}
                    </option>
                  ))}
                </select>
                {selected !== member.role ? (
                  <button
                    type='button'
                    className='button'
                    aria-disabled={change.pending}
                    aria-label={`Save role for ${display}`}
                    onClick={() => change.submit(selected)}
                  >
                    {change.pending ? 'Saving...' : 'Save role'}
                  </button>
                ) : null}
              </>
            ) : null}
            {canRemoveMember(viewerRole, member.role) ? (
              <Confirm
                label='Remove'
                accessibleName={`Remove ${display}`}
                pendingLabel='Removing...'
                question={
                  <>
                    Remove <Untrusted value={display} /> from your Organization? They lose access at
                    once.
                  </>
                }
                confirmLabel='Remove member'
                pending={remove.pending}
                describedBy={error ? errorId : undefined}
                onConfirm={() => remove.submit()}
              />
            ) : null}
          </div>
          {error ? (
            <p className='field-error' id={errorId} role='alert'>
              <strong>Error:</strong> {error}
            </p>
          ) : null}
        </td>
      ) : null}
    </tr>
  )
}
