import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  type AddLineRequest,
  type AssignLineRequest,
  addLineRequestSchema,
  assignLineRequestSchema,
  type Line,
} from 'tula-closeline-contract'
import { fingerprint } from '~/api/idempotency'
import { presentLine } from '~/api/voice-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { can } from '~/data/permissions'
import { refresh, useLines, useMemberSearch, useTeamOptions } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { Banner } from '~/ui/Banner'
import { Confirm } from '~/ui/Confirm'
import { Field } from '~/ui/Field'
import { OwnerCombobox } from '~/ui/OwnerCombobox'
import { Paged } from '~/ui/Paged'
import { plain } from '~/ui/plain'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useClearOnSuccess, useFeedback } from '~/ui/useFeedback'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

const STATE_WORD = { porting: 'Porting', active: 'Active', released: 'Released' } as const

/** Wraps untrusted text in direction isolates, for places markup cannot reach (an option's text). */
function isolate(text: string): string {
  return `\u2068${text}\u2069`
}

/** The Lines of the Organization; Owners and Admins add, assign and release them, and nobody else sees the page. */
export function LinesScreen() {
  useDocumentTitle('Lines')
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.manageLines(role)) {
    return (
      <>
        <PageHeader eyebrow='Organization' title='Lines' />
        <p role='status' className='notice'>
          Only an Owner or Admin can manage Lines. Ask one of them if you need a Line changed.
        </p>
      </>
    )
  }
  return <LinesAdmin />
}

function LinesAdmin() {
  const lines = useLines(true)
  const teams = useTeamOptions(true)
  // Names for the "who answers" lines only; choosing a Rep searches the server (OwnerCombobox).
  const members = useMemberSearch('', true)
  const feedback = useFeedback()
  const headingRef = useRef<HTMLHeadingElement>(null)
  return (
    <>
      <PageHeader
        eyebrow='Organization'
        title='Lines'
        description='The phone numbers your Organization uses for Calls. Assign each Line to a Team or a Rep so inbound Calls reach them.'
        headingRef={headingRef}
        headingProps={{ tabIndex: -1 }}
      />
      <div className='grid items-start gap-12 lg:grid-cols-12'>
        <Section
          id='add-line'
          title='Add a Line'
          description='Buy a new number, or port one your Organization already owns.'
          className='lg:sticky lg:top-8 lg:order-2 lg:col-span-4'
        >
          <AddLineForm onDone={feedback.done} onFail={feedback.failed} />
        </Section>
        <div className='flex min-w-0 flex-col gap-4 lg:order-1 lg:col-span-8'>
          <p role='status' className='notice'>
            {feedback.notice}
          </p>
          <h2 className='m-0 border-t border-rule-strong pt-4'>All Lines</h2>
          <Paged
            noun='Lines'
            emptyText='There are no Lines yet.'
            emptyHint='Add the first one with the form on this page.'
            state={lines.state}
            present={presentLine}
          >
            <ul
              className='m-0 list-none divide-y border-y p-0 motion-safe:animate-fade'
              aria-label='Lines'
            >
              {lines.items.map((line) => (
                <LineItem
                  key={line.id}
                  line={line}
                  teams={teams.items}
                  reps={members.items.filter((member) => member.role === 'rep')}
                  onDone={feedback.done}
                  onFail={feedback.failed}
                  serial={feedback.serial}
                  onReleased={() => headingRef.current?.focus()}
                />
              ))}
            </ul>
          </Paged>
        </div>
      </div>
    </>
  )
}

type AddErrors = {
  country?: string
  areaCode?: string
  number?: string
  label?: string
  form?: string
}

const ADD_RULES: Record<string, keyof AddErrors> = {
  country: 'country',
  areaCode: 'areaCode',
  number: 'number',
  label: 'label',
}

const ADD_WORDS: Record<keyof Omit<AddErrors, 'form'>, string> = {
  country: 'Enter the country as two capital letters, such as US.',
  areaCode: 'Enter the area code as 2 to 6 digits, or leave it empty.',
  number: 'Enter the number you want to port, such as +14155550100.',
  label: 'Keep the label to 100 characters or fewer, with no control characters.',
}

function AddLineForm(props: {
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const [method, setMethod] = useState<'buy' | 'port'>('buy')
  const [country, setCountry] = useState('')
  const [areaCode, setAreaCode] = useState('')
  const [number, setNumber] = useState('')
  const [label, setLabel] = useState('')
  const [errors, setErrors] = useState<AddErrors>({})
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const add = useSubmit<AddLineRequest>(
    async (body) => {
      const attempt = app.keys.begin(fingerprint.line(JSON.stringify(body)))
      try {
        await app.voice.addLine(body, attempt.key)
      } catch (error) {
        attempt.failed(error)
        throw error
      }
      attempt.succeeded()
      setCountry('')
      setAreaCode('')
      setNumber('')
      setLabel('')
      setErrors({})
      await refresh(app, 'lines')
      props.onDone('Line added.')
    },
    {
      onError(error) {
        props.onFail()
        setErrors({ form: presentLine(error).message })
        focusFirstError()
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (add.pending) {
      return
    }
    props.onFail()
    const trimmedLabel = label.trim()
    const extra = trimmedLabel === '' ? {} : { label: trimmedLabel }
    const candidate =
      method === 'buy'
        ? {
            method,
            country: country.trim(),
            ...(areaCode.trim() === '' ? {} : { areaCode: areaCode.trim() }),
            ...extra,
          }
        : { method, number: number.trim(), ...extra }
    const parsed = addLineRequestSchema.safeParse(candidate)
    const portNumberMissing = method === 'port' && number.trim() === ''
    if (!parsed.success || portNumberMissing) {
      const next: AddErrors = {}
      if (portNumberMissing) {
        next.number = ADD_WORDS.number
      }
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        const field = ADD_RULES[String(issue.path[0])]
        if (field !== undefined && field !== 'form') {
          next[field] = ADD_WORDS[field]
        }
      }
      setErrors(next)
      focusFirstError()
      return
    }
    setErrors({})
    add.submit(parsed.data)
  }
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-labelledby='add-line-heading'
      className='gap-0'
    >
      {errors.form ? (
        <Banner kind='error' innerRef={bannerRef}>
          {errors.form}
        </Banner>
      ) : null}
      <SelectField
        label='How'
        name='method'
        value={method}
        options={[
          { value: 'buy', text: 'Buy a new number' },
          { value: 'port', text: 'Port a number you own' },
        ]}
        onChange={(event) => setMethod(event.target.value === 'port' ? 'port' : 'buy')}
      />
      {method === 'buy' ? (
        <>
          <Field
            label='Country'
            name='country'
            autoComplete='off'
            hint='Two capital letters, such as US.'
            value={country}
            error={errors.country}
            onChange={(event) => setCountry(event.target.value)}
          />
          <Field
            label='Area code (optional)'
            name='areaCode'
            autoComplete='off'
            inputMode='numeric'
            value={areaCode}
            error={errors.areaCode}
            onChange={(event) => setAreaCode(event.target.value)}
          />
        </>
      ) : (
        <Field
          label='Number'
          name='number'
          autoComplete='off'
          inputMode='tel'
          value={number}
          error={errors.number}
          onChange={(event) => setNumber(event.target.value)}
        />
      )}
      <Field
        label='Label (optional)'
        name='label'
        autoComplete='off'
        value={label}
        error={errors.label}
        onChange={(event) => setLabel(event.target.value)}
      />
      <div>
        <button type='submit' className='button w-full' aria-disabled={add.pending}>
          {add.pending ? 'Adding...' : 'Add Line'}
        </button>
      </div>
    </form>
  )
}

type Named = { readonly id: string; readonly name: string | null; readonly email?: string }

function assignmentValue(line: Line): string {
  const { assignment } = line
  if (assignment.kind === 'team') {
    return `team:${assignment.teamId}`
  }
  return assignment.kind === 'rep' ? `rep:${assignment.membershipId}` : 'unassigned'
}

function toRequest(value: string): AssignLineRequest {
  if (value.startsWith('team:')) {
    return assignLineRequestSchema.parse({ kind: 'team', teamId: value.slice('team:'.length) })
  }
  if (value.startsWith('rep:')) {
    return assignLineRequestSchema.parse({ kind: 'rep', membershipId: value.slice('rep:'.length) })
  }
  return { kind: 'unassigned' }
}

function LineItem(props: {
  readonly line: Line
  readonly teams: readonly Named[]
  readonly reps: readonly Named[]
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
  readonly serial: number
  readonly onReleased: () => void
}) {
  const { line } = props
  const app = useApp()
  const label = plain(line.number, 'unknown number')
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const assignButton = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const errorId = `${line.id}-error`
  const clearError = useCallback(() => setError(null), [])
  useClearOnSuccess(props.serial, clearError)
  useEffect(() => {
    if (!assigning && restoreFocus.current) {
      restoreFocus.current = false
      assignButton.current?.focus()
    }
  }, [assigning])
  const release = useSubmit<void>(
    async () => {
      setError(null)
      await app.voice.releaseLine(line.id)
      await refresh(app, 'lines')
      props.onDone('Line released.')
      props.onReleased()
    },
    {
      onError: (failure) => {
        props.onFail()
        setError(presentLine(failure).message)
      },
    }
  )
  const answering = (() => {
    const { assignment } = line
    if (assignment.kind === 'team') {
      const team = props.teams.find((candidate) => candidate.id === assignment.teamId)
      return team ? (
        <>
          Rings the Team <Untrusted value={team.name ?? ''} />
        </>
      ) : (
        'Rings a Team'
      )
    }
    if (assignment.kind === 'rep') {
      const rep = props.reps.find((candidate) => candidate.id === assignment.membershipId)
      return rep ? (
        <>
          Rings the Rep <Untrusted value={rep.name ?? rep.email ?? ''} />
        </>
      ) : (
        'Rings a Rep'
      )
    }
    return 'Nobody answers yet'
  })()
  const changeable = line.state !== 'released'
  return (
    <li className='py-4'>
      <div className='list-item-head'>
        <div className='flex min-w-0 flex-col'>
          <h3 className='item-title m-0 font-serif text-xl font-normal tracking-[-0.01em]'>
            <Untrusted value={line.number} />
          </h3>
          {line.label ? (
            <span className='hint'>
              <Untrusted value={line.label} />
            </span>
          ) : null}
          <span className='label-mono mt-1 block'>{STATE_WORD[line.state]}</span>
          {changeable ? <span className='hint'>{answering}</span> : null}
        </div>
        {changeable ? (
          <div className='row-actions'>
            <button
              type='button'
              ref={assignButton}
              className='button button-quiet'
              aria-label={`Assign ${label}`}
              aria-expanded={assigning}
              aria-controls={`${line.id}-assign`}
              onClick={() => setAssigning((open) => !open)}
            >
              Assign
            </button>
            <Confirm
              label='Release'
              accessibleName={`Release ${label}`}
              pendingAccessibleName={`Releasing ${label}`}
              pendingLabel='Releasing...'
              question={
                <>
                  Release the Line <Untrusted value={line.number} />? Your Organization gives the
                  number up and it cannot be changed afterwards.
                </>
              }
              tone='quiet-destructive'
              confirmLabel='Release Line'
              pending={release.pending}
              describedBy={error ? errorId : undefined}
              onConfirm={() => release.submit()}
            />
          </div>
        ) : null}
      </div>
      {error ? (
        <p className='field-error' id={errorId} role='alert'>
          <strong>Error:</strong> {error}
        </p>
      ) : null}
      {changeable && assigning ? (
        <AssignForm
          line={line}
          teams={props.teams}
          onDone={props.onDone}
          onFail={props.onFail}
          onClose={() => {
            restoreFocus.current = true
            setAssigning(false)
          }}
        />
      ) : null}
    </li>
  )
}

function AssignForm(props: {
  readonly line: Line
  readonly teams: readonly Named[]
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
  readonly onClose: () => void
}) {
  const app = useApp()
  const [value, setValue] = useState(assignmentValue(props.line).replace(/^rep:.*/, 'rep'))
  const [rep, setRep] = useState({
    id: props.line.assignment.kind === 'rep' ? props.line.assignment.membershipId : '',
    name: props.line.assignment.kind === 'rep' ? 'Current Rep' : '',
  })
  const [error, setError] = useState<string | null>(null)
  const [repError, setRepError] = useState<string | undefined>(undefined)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const assign = useSubmit<string>(
    async (chosen) => {
      await app.voice.assignLine(props.line.id, toRequest(chosen))
      await refresh(app, 'lines')
      props.onDone('Line assigned.')
      props.onClose()
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentLine(failure).message)
        focusFirstError()
      },
    }
  )
  const options = [
    { value: 'unassigned', text: 'Nobody' },
    // The current Team, kept choosable while the list loads or when it is not in it.
    ...(props.line.assignment.kind !== 'team' ||
    props.teams.some((team) => `team:${team.id}` === assignmentValue(props.line))
      ? []
      : [{ value: assignmentValue(props.line), text: 'Current assignment' }]),
    ...props.teams.map((team) => ({
      value: `team:${team.id}`,
      text: `Team: ${isolate(team.name ?? '')}`,
    })),
    { value: 'rep', text: 'A Rep' },
  ]
  return (
    <form
      ref={formRef}
      id={`${props.line.id}-assign`}
      noValidate
      aria-label='Assign Line'
      className='mt-3 max-w-none gap-0 border-l-2 border-rule-strong pl-4 motion-safe:animate-rise'
      onSubmit={(event) => {
        event.preventDefault()
        if (!assign.pending) {
          props.onFail()
          setError(null)
          setRepError(undefined)
          if (value === 'rep' && rep.id === '') {
            setRepError('Choose a Rep.')
            return
          }
          assign.submit(value === 'rep' ? `rep:${rep.id}` : value)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          props.onClose()
        }
      }}
    >
      {error ? (
        <Banner kind='error' innerRef={bannerRef}>
          {error}
        </Banner>
      ) : null}
      <SelectField
        label='Who answers'
        name='assignment'
        value={value}
        options={options}
        onChange={(event) => setValue(event.target.value)}
      />
      {value === 'rep' ? (
        <OwnerCombobox
          label='Rep'
          anyText='Choose a Rep'
          enabled
          value={rep.id}
          valueName={rep.name}
          error={repError}
          accept={(member) => member.role === 'rep'}
          onChange={(id, name) => setRep({ id, name })}
        />
      ) : null}
      <div className='row-actions'>
        <button type='submit' className='button' aria-disabled={assign.pending}>
          {assign.pending ? 'Saving...' : 'Save assignment'}
        </button>
        <button type='button' className='button button-quiet' onClick={props.onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
