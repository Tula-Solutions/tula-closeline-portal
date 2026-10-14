import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { CORE_ERRORS, type Team, teamNameSchema } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { fingerprint } from '~/api/idempotency'
import { presentManage } from '~/api/manage-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { can } from '~/data/permissions'
import { refresh, useMembers, useTeams } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { Banner } from '~/ui/Banner'
import { Confirm } from '~/ui/Confirm'
import { Field } from '~/ui/Field'
import { Paged } from '~/ui/Paged'
import { plain } from '~/ui/plain'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useClearOnSuccess, useFeedback } from '~/ui/useFeedback'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

const NAME_RULE = 'Enter a name of 1 to 200 characters, with no control characters.'

/** Wraps untrusted text in direction isolates, for places markup cannot reach (an option's text). */
function isolate(text: string): string {
  return `⁨${text}⁩`
}

/** The Teams of the Organization; Owners and Admins create, rename and delete them and change who is in them. */
export function TeamsScreen() {
  useDocumentTitle('Teams')
  const role = useRole()
  const teams = useTeams()
  const feedback = useFeedback()
  const headingRef = useRef<HTMLHeadingElement>(null)
  if (role === null) {
    return null
  }
  const manage = can.manageTeams(role)
  return (
    <>
      <PageHeader
        title='Teams'
        description='Group Reps into Teams so a Manager can see how each one is doing.'
        headingRef={headingRef}
        headingProps={{ tabIndex: -1 }}
      />
      {manage ? <CreateTeamForm onDone={feedback.done} onFail={feedback.failed} /> : null}
      <p role='status' className='notice'>
        {feedback.notice}
      </p>
      <Paged noun='Teams' emptyText='There are no Teams yet.' state={teams.state}>
        <ul className='plain-list' aria-label='Teams'>
          {teams.items.map((team) => (
            <TeamItem
              key={team.id}
              team={team}
              manage={manage}
              onDone={feedback.done}
              onFail={feedback.failed}
              serial={feedback.serial}
              onDeleted={() => headingRef.current?.focus()}
            />
          ))}
        </ul>
      </Paged>
    </>
  )
}

function CreateTeamForm(props: {
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const [name, setName] = useState('')
  const [errors, setErrors] = useState<{ name?: string; form?: string }>({})
  const box = useRef<HTMLDivElement>(null)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const create = useSubmit<string>(
    async (teamName) => {
      const attempt = app.keys.begin(fingerprint.team(teamName))
      try {
        await app.core.createTeam({ name: teamName }, attempt.key)
      } catch (error) {
        attempt.failed(error)
        throw error
      }
      attempt.succeeded()
      setName('')
      setErrors({})
      await refresh(app, 'teams')
      props.onDone('Team created.')
      box.current?.querySelector('input')?.focus()
    },
    {
      onError(error) {
        const shown = presentManage(error)
        props.onFail()
        setErrors(shown.field === 'name' ? { name: shown.message } : { form: shown.message })
        focusFirstError()
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (create.pending) {
      return
    }
    props.onFail()
    const parsed = teamNameSchema.safeParse(name)
    if (!parsed.success) {
      setErrors({ name: NAME_RULE })
      focusFirstError()
      return
    }
    setErrors({})
    create.submit(parsed.data)
  }
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-labelledby='create-team-heading'>
      <h2 id='create-team-heading'>Create a Team</h2>
      {errors.form ? (
        <Banner kind='error' innerRef={bannerRef}>
          {errors.form}
        </Banner>
      ) : null}
      <div ref={box}>
        <Field
          label='Team name'
          name='teamName'
          autoComplete='off'
          value={name}
          error={errors.name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div>
        <button type='submit' className='button' aria-disabled={create.pending}>
          {create.pending ? 'Creating...' : 'Create Team'}
        </button>
      </div>
    </form>
  )
}

function TeamItem(props: {
  readonly team: Team
  readonly manage: boolean
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
  readonly serial: number
  readonly onDeleted: () => void
}) {
  const { team } = props
  const label = plain(team.name, 'unnamed Team')
  const app = useApp()
  const [renaming, setRenaming] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const renameButton = useRef<HTMLButtonElement>(null)
  const errorId = `${team.id}-error`
  const clearError = useCallback(() => setError(null), [])
  useClearOnSuccess(props.serial, clearError)
  const restoreFocus = useRef(false)
  useEffect(() => {
    if (!renaming && restoreFocus.current) {
      restoreFocus.current = false
      renameButton.current?.focus()
    }
  }, [renaming])
  const remove = useSubmit<void>(
    async () => {
      setError(null)
      // A Team of this name is gone: creating one again is a new intent, not a retry.
      app.keys.drop(fingerprint.team(team.name.trim()))
      await app.core.deleteTeam(team.id)
      await refresh(app, 'teams')
      props.onDone('Team deleted.')
      props.onDeleted()
    },
    {
      onError: (failure) => {
        props.onFail()
        setError(presentManage(failure).message)
      },
    }
  )
  return (
    <li className='list-item'>
      <div className='list-item-head'>
        <h2 className='item-title'>
          <Untrusted value={team.name} />
        </h2>
        {props.manage ? (
          <div className='row-actions'>
            <button
              type='button'
              ref={renameButton}
              className='button button-quiet'
              aria-label={`Rename ${label}`}
              aria-expanded={renaming}
              onClick={() => setRenaming(true)}
            >
              Rename
            </button>
            <button
              type='button'
              className='button button-quiet'
              aria-label={`Members of ${label}`}
              aria-expanded={membersOpen}
              aria-controls={`${team.id}-members`}
              onClick={() => setMembersOpen((open) => !open)}
            >
              Members
            </button>
            <Confirm
              label='Delete'
              accessibleName={`Delete ${label}`}
              pendingAccessibleName={`Deleting ${label}`}
              pendingLabel='Deleting...'
              question={
                <>
                  Delete the Team <Untrusted value={team.name} />? Its members stay in your
                  Organization.
                </>
              }
              confirmLabel='Delete Team'
              pending={remove.pending}
              describedBy={error ? errorId : undefined}
              onConfirm={() => remove.submit()}
            />
          </div>
        ) : null}
      </div>
      {error ? (
        <p className='field-error' id={errorId} role='alert'>
          <strong>Error:</strong> {error}
        </p>
      ) : null}
      {renaming ? (
        <RenameForm
          team={team}
          onClose={() => {
            restoreFocus.current = true
            setRenaming(false)
          }}
          onDone={props.onDone}
        />
      ) : null}
      {props.manage && membersOpen ? <TeamMembersPanel team={team} onFail={props.onFail} /> : null}
    </li>
  )
}

function RenameForm(props: {
  readonly team: Team
  readonly onClose: () => void
  readonly onDone: (notice: string) => void
}) {
  const app = useApp()
  const [name, setName] = useState(props.team.name)
  const [errors, setErrors] = useState<{ name?: string; form?: string }>({})
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const input = useRef<HTMLDivElement>(null)
  useEffect(() => {
    input.current?.querySelector('input')?.focus()
  }, [])
  const rename = useSubmit<string>(
    async (next) => {
      await app.core.renameTeam(props.team.id, next)
      await refresh(app, 'teams')
      props.onDone('Team renamed.')
      props.onClose()
    },
    {
      onError(error) {
        const shown = presentManage(error)
        setErrors(shown.field === 'name' ? { name: shown.message } : { form: shown.message })
        focusFirstError()
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (rename.pending) {
      return
    }
    const parsed = teamNameSchema.safeParse(name)
    if (!parsed.success) {
      setErrors({ name: NAME_RULE })
      focusFirstError()
      return
    }
    setErrors({})
    rename.submit(parsed.data)
  }
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-label='Rename Team'
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          props.onClose()
        }
      }}
    >
      {errors.form ? (
        <Banner kind='error' innerRef={bannerRef}>
          {errors.form}
        </Banner>
      ) : null}
      <div ref={input}>
        <Field
          label='New Team name'
          name='teamName'
          autoComplete='off'
          value={name}
          error={errors.name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className='row-actions'>
        <button type='submit' className='button' aria-disabled={rename.pending}>
          {rename.pending ? 'Saving...' : 'Save name'}
        </button>
        <button type='button' className='button button-quiet' onClick={props.onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/**
 * Adds or removes one member of a Team. Core serves no list of a Team's members, so the member is
 * chosen from the Organization's members (a page at a time); adding someone already in the Team and
 * removing someone not in it both succeed.
 */
function TeamMembersPanel(props: { readonly team: Team; readonly onFail: () => void }) {
  const app = useApp()
  const members = useMembers(true)
  const label = plain(props.team.name, 'unnamed Team')
  const [membershipId, setMembershipId] = useState('')
  // One result for this panel, shown beside its buttons: what the last add or remove did.
  const [result, setResult] = useState<{ readonly ok: boolean; readonly text: string } | null>(null)
  const errorId = `${props.team.id}-members-error`
  // The chosen member, or the first when they are no longer in the list (and nothing for an empty list).
  const chosen = members.items.some((member) => member.id === membershipId)
    ? membershipId
    : (members.items[0]?.id ?? '')
  const onError = (failure: unknown) =>
    setResult({ ok: false, text: presentManage(failure).message })
  const add = useSubmit<string>(
    async (id) => {
      setResult(null)
      props.onFail()
      // Adding is a new intent after any removal: a removal key left from an unsure removal must
      // not be reused for the next removal (core would replay the first answer).
      app.keys.drop(fingerprint.teamMemberRemoval(props.team.id, id))
      const attempt = app.keys.begin(fingerprint.teamMember(props.team.id, id))
      try {
        await app.core.addTeamMember(props.team.id, id, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      setResult({ ok: true, text: 'Member added to the Team.' })
    },
    { onError }
  )
  const take = useSubmit<string>(
    async (id) => {
      setResult(null)
      props.onFail()
      // Whatever was unsure about adding this member is over: adding again is a new intent.
      app.keys.drop(fingerprint.teamMember(props.team.id, id))
      // A fresh key for each removal the person asks for; only a retry after a lost answer reuses it.
      const attempt = app.keys.begin(fingerprint.teamMemberRemoval(props.team.id, id))
      try {
        await app.core.removeTeamMember(props.team.id, id, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      setResult({ ok: true, text: 'Member removed from the Team.' })
    },
    {
      onError(failure) {
        // Core says so when the member was not in the Team: that is what was wanted.
        if (failure instanceof ApiError && failure.code === CORE_ERRORS['member.not_found'].code) {
          setResult({ ok: true, text: 'That member is already not in this Team.' })
          return
        }
        onError(failure)
      },
    }
  )
  return (
    <section id={`${props.team.id}-members`} aria-label={`Members of ${label}`}>
      <p className='hint'>
        The list of who is in a Team is not available yet. Choose a member to add or remove.
      </p>
      <Paged noun='members' emptyText='There are no members to choose from.' state={members.state}>
        <SelectField
          label='Member'
          name='member'
          value={chosen}
          aria-describedby={result?.ok === false ? errorId : undefined}
          options={members.items.map((member) => ({
            value: member.id,
            text: `${isolate(member.name ?? member.email)} ${isolate(`<${member.email}>`)}`,
          }))}
          onChange={(event) => setMembershipId(event.target.value)}
        />
        {result === null ? null : result.ok ? (
          <p role='status' className='notice'>
            {result.text}
          </p>
        ) : (
          <p className='field-error' id={errorId} role='alert'>
            <strong>Error:</strong> {result.text}
          </p>
        )}
        <div className='row-actions'>
          <button
            type='button'
            className='button'
            aria-disabled={add.pending || chosen === ''}
            onClick={() => chosen !== '' && add.submit(chosen)}
          >
            {add.pending ? 'Adding...' : 'Add to Team'}
          </button>
          <button
            type='button'
            className='button button-quiet'
            aria-disabled={take.pending || chosen === ''}
            onClick={() => chosen !== '' && take.submit(chosen)}
          >
            {take.pending ? 'Removing...' : 'Remove from Team'}
          </button>
        </div>
      </Paged>
    </section>
  )
}
