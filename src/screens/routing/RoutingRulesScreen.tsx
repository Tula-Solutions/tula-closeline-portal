import { useCallback, useRef, useState } from 'react'
import type { CreateRoutingRuleRequest, RoutingRule } from 'tula-closeline-contract'
import { fingerprint } from '~/api/idempotency'
import { presentRouting } from '~/api/routing-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { can } from '~/data/permissions'
import {
  refresh,
  useBookingTypes,
  useMembersByIds,
  useRoutingRules,
  useTeamOptions,
} from '~/data/queries'
import { useRole } from '~/data/session-role'
import { draftOf, EMPTY, RuleForm } from '~/screens/routing/RuleForm'
import { SamplePanel } from '~/screens/routing/SamplePanel'
import { Banner } from '~/ui/Banner'
import { Confirm } from '~/ui/Confirm'
import { Paged } from '~/ui/Paged'
import { plain } from '~/ui/plain'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useClearOnSuccess, useFeedback } from '~/ui/useFeedback'
import { useSubmit } from '~/ui/useSubmit'

/** The Routing Rules, in the order they are tried; Owners and Admins manage them all, a Manager only those sending to their own Team, and a Rep sees no page. */
export function RoutingRulesScreen() {
  useDocumentTitle('Routing')
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.manageRoutingRules(role)) {
    return (
      <>
        <PageHeader eyebrow='Sales' title='Routing' />
        <p role='status' className='notice'>
          Only an Owner, Admin or Manager can see Routing Rules. Ask one of them if a Booking should
          go to someone else.
        </p>
      </>
    )
  }
  return (
    <RoutingAdmin
      canReorder={can.reorderRoutingRules(role)}
      canPickBookingTypes={can.manageBookingTypes(role)}
    />
  )
}

type Names = {
  readonly member: (id: string) => string
  readonly team: (id: string) => string
  readonly bookingType: (id: string) => string
}

function useNames(rules: readonly RoutingRule[], canPickBookingTypes: boolean): Names {
  const memberIds = rules.flatMap((rule) => [
    ...(rule.conditions.accountOwnerMembershipIds ?? []),
    ...(rule.target.kind === 'rep'
      ? [rule.target.membershipId]
      : rule.target.kind === 'pool'
        ? rule.target.membershipIds
        : []),
  ])
  const members = useMembersByIds(memberIds)
  const teams = useTeamOptions(rules.some((rule) => rule.target.kind === 'team'))
  const types = useBookingTypes(canPickBookingTypes)
  return {
    member: (id) => {
      const found = members.get(id)
      return found === undefined ? 'a Rep' : plain(found.name ?? found.email, 'Unnamed member')
    },
    team: (id) => plain(teams.items.find((team) => team.id === id)?.name ?? '', 'a Team'),
    bookingType: (id) =>
      plain(types.items.find((type) => type.id === id)?.name ?? '', 'a Booking Type'),
  }
}

function conditionText(rule: RoutingRule, names: Names): string {
  const { conditions } = rule
  const parts = [
    conditions.countries ? `country ${conditions.countries.join(', ')}` : null,
    conditions.regions ? `region ${conditions.regions.join(', ')}` : null,
    conditions.companySizeBands ? `company size ${conditions.companySizeBands.join(', ')}` : null,
    conditions.sources ? `source ${conditions.sources.join(', ')}` : null,
    conditions.accountOwnerMembershipIds
      ? `account owner ${conditions.accountOwnerMembershipIds.map(names.member).join(', ')}`
      : null,
    conditions.bookingTypeIds
      ? `Booking Type ${conditions.bookingTypeIds.map(names.bookingType).join(', ')}`
      : null,
  ].filter((part) => part !== null)
  return rule.isDefault ? 'Anyone no earlier rule matched' : parts.join('; ')
}

function targetText(rule: RoutingRule, names: Names): string {
  const { target } = rule
  if (target.kind === 'rep') {
    return `Rep ${names.member(target.membershipId)}`
  }
  if (target.kind === 'team') {
    return `Team ${names.team(target.teamId)}, in turn`
  }
  return `Pool of ${target.membershipIds.map(names.member).join(', ')}, in turn`
}

type Move = { readonly id: RoutingRule['id']; readonly delta: -1 | 1; readonly label: string }

function RoutingAdmin(props: {
  readonly canReorder: boolean
  readonly canPickBookingTypes: boolean
}) {
  const app = useApp()
  const rules = useRoutingRules(true)
  const names = useNames(rules.items, props.canPickBookingTypes)
  const feedback = useFeedback()
  const [moveError, setMoveError] = useState<string | null>(null)
  const move = useSubmit<Move>(
    async ({ id, delta, label }) => {
      setMoveError(null)
      const ids = rules.items.map((rule) => rule.id)
      const at = ids.indexOf(id)
      const next = [...ids]
      next.splice(at, 1)
      next.splice(at + delta, 0, id)
      await app.routing.reorder(next)
      await refresh(app, 'routingRules')
      feedback.done(`Moved ${label} ${delta < 0 ? 'up' : 'down'} to position ${at + delta + 1}.`)
      // The moved rule's buttons keep the keyboard where it was; an edge one is disabled, so use the other.
      setTimeout(() => {
        const want = document.getElementById(`${id}-${delta < 0 ? 'up' : 'down'}`)
        const other = document.getElementById(`${id}-${delta < 0 ? 'down' : 'up'}`)
        const target = want instanceof HTMLButtonElement && !want.disabled ? want : other
        if (target instanceof HTMLButtonElement) {
          target.focus()
        }
      }, 0)
    },
    {
      onError(failure) {
        feedback.failed()
        setMoveError(presentRouting(failure).message)
      },
    }
  )
  return (
    <>
      <PageHeader
        eyebrow='Sales'
        title='Routing'
        description='Who gets a Prospect that wants to book. The first rule that matches wins; the default rule, tried last, catches the rest.'
      />
      <div className='grid items-start gap-12 lg:grid-cols-12'>
        <div className='flex min-w-0 flex-col gap-8 lg:col-span-8'>
          <div className='flex flex-col gap-4'>
            <p role='status' className='notice'>
              {feedback.notice}
            </p>
            {moveError ? <Banner kind='error'>{moveError}</Banner> : null}
            <h2 className='m-0 border-t border-rule-strong pt-4'>Rules, in the order tried</h2>
            {props.canReorder && !rules.complete ? (
              <p className='hint m-0'>Reordering waits until every rule has loaded.</p>
            ) : null}
            <Paged
              noun='Routing Rules'
              emptyText='There are no Routing Rules yet.'
              emptyHint='Add a rule with the form on this page. Without one, no Rep is chosen.'
              state={rules.state}
              present={presentRouting}
            >
              <ol
                className='m-0 list-none divide-y border-y p-0 motion-safe:animate-fade'
                aria-label='Routing Rules'
              >
                {rules.items.map((rule, index) => (
                  <RuleItem
                    key={rule.id}
                    rule={rule}
                    names={names}
                    canPickBookingTypes={props.canPickBookingTypes}
                    canMoveUp={props.canReorder && rules.complete && !rule.isDefault && index > 0}
                    canMoveDown={
                      props.canReorder &&
                      rules.complete &&
                      !rule.isDefault &&
                      rules.items[index + 1]?.isDefault === false
                    }
                    showMoves={props.canReorder}
                    movePending={move.pending}
                    onMove={move.submit}
                    onDone={feedback.done}
                    onFail={feedback.failed}
                    serial={feedback.serial}
                  />
                ))}
              </ol>
            </Paged>
          </div>
          <SamplePanel rules={rules.items} canPickBookingTypes={props.canPickBookingTypes} />
        </div>
        <Section
          id='add-routing-rule'
          title='Add a rule'
          description='It joins the list just before the default rule.'
          className='lg:col-span-4'
        >
          <CreateForm
            canPickBookingTypes={props.canPickBookingTypes}
            onDone={feedback.done}
            onFail={feedback.failed}
          />
        </Section>
      </div>
    </>
  )
}

function CreateForm(props: {
  readonly canPickBookingTypes: boolean
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const [error, setError] = useState<string | undefined>()
  // A new key gives the form its empty fields back after a save.
  const [round, setRound] = useState(0)
  const add = useSubmit<CreateRoutingRuleRequest>(
    async (body) => {
      const attempt = app.keys.begin(fingerprint.routingRuleCreate(JSON.stringify(body)))
      try {
        await app.routing.create(body, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      setError(undefined)
      setRound((n) => n + 1)
      await refresh(app, 'routingRules')
      props.onDone('Routing Rule added.')
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentRouting(failure).message)
      },
    }
  )
  return (
    <RuleForm
      key={round}
      idPrefix='add'
      ariaLabel='Add a Routing Rule'
      initial={EMPTY}
      submitLabel='Add rule'
      pendingLabel='Adding...'
      pending={add.pending}
      formError={error}
      canPickBookingTypes={props.canPickBookingTypes}
      onInvalid={() => {
        setError(undefined)
        props.onFail()
      }}
      onValid={add.submit}
    />
  )
}

function RuleItem(props: {
  readonly rule: RoutingRule
  readonly names: Names
  readonly canPickBookingTypes: boolean
  readonly showMoves: boolean
  readonly canMoveUp: boolean
  readonly canMoveDown: boolean
  readonly movePending: boolean
  readonly onMove: (move: Move) => void
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
  readonly serial: number
}) {
  const { rule } = props
  const app = useApp()
  const label = plain(rule.name, 'this rule')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | undefined>()
  const editButton = useRef<HTMLButtonElement>(null)
  const errorId = `${rule.id}-error`
  const clearError = useCallback(() => setError(null), [])
  useClearOnSuccess(props.serial, clearError)
  const remove = useSubmit<void>(
    async () => {
      setError(null)
      await app.routing.remove(rule.id)
      await refresh(app, 'routingRules')
      props.onDone('Routing Rule deleted.')
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentRouting(failure).message)
      },
    }
  )
  const save = useSubmit<CreateRoutingRuleRequest>(
    async (body) => {
      await app.routing.update(rule.id, body)
      setEditError(undefined)
      await refresh(app, 'routingRules')
      props.onDone('Routing Rule saved.')
      setEditing(false)
      setTimeout(() => editButton.current?.focus(), 0)
    },
    {
      onError(failure) {
        props.onFail()
        setEditError(presentRouting(failure).message)
      },
    }
  )
  const when = conditionText(rule, props.names)
  return (
    <li className='py-4'>
      <div className='list-item-head'>
        <div className='flex min-w-0 flex-col'>
          <span className='label-mono'>
            {rule.position}
            {rule.isDefault ? ' · Default, tried last' : ''}
          </span>
          <h3 className='item-title m-0 font-serif text-xl font-normal tracking-[-0.01em]'>
            <Untrusted value={rule.name} />
          </h3>
          <span className='hint'>When: {when}</span>
          <span className='hint'>Goes to: {targetText(rule, props.names)}</span>
        </div>
        <div className='row-actions'>
          {props.showMoves ? (
            <>
              <button
                type='button'
                id={`${rule.id}-up`}
                className='button button-quiet'
                aria-label={`Move ${label} up`}
                disabled={!props.canMoveUp || props.movePending}
                onClick={() => props.onMove({ id: rule.id, delta: -1, label })}
              >
                Up
              </button>
              <button
                type='button'
                id={`${rule.id}-down`}
                className='button button-quiet'
                aria-label={`Move ${label} down`}
                disabled={!props.canMoveDown || props.movePending}
                onClick={() => props.onMove({ id: rule.id, delta: 1, label })}
              >
                Down
              </button>
            </>
          ) : null}
          <button
            type='button'
            ref={editButton}
            className='button button-quiet'
            aria-label={`Edit ${label}`}
            aria-expanded={editing}
            aria-controls={editing ? `${rule.id}-edit` : undefined}
            onClick={() => setEditing((open) => !open)}
          >
            Edit
          </button>
          <Confirm
            label='Delete'
            accessibleName={`Delete ${label}`}
            pendingAccessibleName={`Deleting ${label}`}
            pendingLabel='Deleting...'
            question={
              <>
                Delete <Untrusted value={rule.name} />? Prospects it matched fall to the next rule.
              </>
            }
            tone='quiet-destructive'
            confirmLabel='Delete rule'
            pending={remove.pending}
            describedBy={error ? errorId : undefined}
            onConfirm={() => remove.submit()}
          />
        </div>
      </div>
      {error ? (
        <p className='field-error' id={errorId} role='alert'>
          <strong>Error:</strong> {error}
        </p>
      ) : null}
      {editing ? (
        <RuleForm
          idPrefix={rule.id}
          id={`${rule.id}-edit`}
          ariaLabel={`Edit ${label}`}
          initial={draftOf(rule)}
          submitLabel='Save changes'
          pendingLabel='Saving...'
          pending={save.pending}
          formError={editError}
          canPickBookingTypes={props.canPickBookingTypes}
          className='mt-3 max-w-none gap-0 border-l-2 border-rule-strong pl-4 motion-safe:animate-rise'
          onInvalid={() => {
            setEditError(undefined)
            props.onFail()
          }}
          onValid={save.submit}
          onCancel={() => {
            setEditing(false)
            setEditError(undefined)
            setTimeout(() => editButton.current?.focus(), 0)
          }}
        />
      ) : null}
    </li>
  )
}
