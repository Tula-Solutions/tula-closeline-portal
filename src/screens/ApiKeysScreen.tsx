import { type FormEvent, useEffect, useRef, useState } from 'react'
import {
  API_KEY_AREAS,
  type ApiKey,
  type ApiKeyScope,
  createApiKeyRequestSchema,
  MAX_API_KEY_NAME_LENGTH,
  ROLES,
  type Role,
} from 'tula-closeline-contract'
import { presentApiKey } from '~/api/api-key-messages'
import { fingerprint } from '~/api/idempotency'
import { outcomeUnknown } from '~/api/manage-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { can, ROLE_LABEL } from '~/data/permissions'
import { refresh, useApiKeys } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { Banner } from '~/ui/Banner'
import { Confirm } from '~/ui/Confirm'
import { Field } from '~/ui/Field'
import { Paged } from '~/ui/Paged'
import { plain } from '~/ui/plain'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFeedback } from '~/ui/useFeedback'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

const DAY_MS = 24 * 60 * 60 * 1000

/** How long a new key lasts; a key that never expires is a choice the person makes on purpose. */
const EXPIRY_CHOICES = [
  { value: '30', text: '30 days', days: 30 },
  { value: '90', text: '90 days', days: 90 },
  { value: '365', text: '1 year', days: 365 },
  { value: 'never', text: 'No expiry', days: null },
] as const

const AREA_WORD: Record<(typeof API_KEY_AREAS)[number], string> = {
  prospects: 'Prospects',
  consent: 'Contact Consent',
  enrichment: 'Enrichment',
  campaigns: 'Campaigns',
  messaging: 'Messages',
  bookings: 'Bookings',
  playbook: 'Playbook',
  calls: 'Calls',
}

type State = 'Active' | 'Revoked' | 'Expired'

function stateOf(key: ApiKey, now: number): State {
  if (key.revokedAt !== null) {
    return 'Revoked'
  }
  return key.expiresAt !== null && Date.parse(key.expiresAt) <= now ? 'Expired' : 'Active'
}

/** The API keys of the Organization; Owners and Admins create and revoke them, and nobody else sees the page. */
export function ApiKeysScreen() {
  useDocumentTitle('API keys')
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.manageApiKeys(role)) {
    return (
      <>
        <PageHeader eyebrow='Organization' title='API keys' />
        <p role='status' className='notice'>
          Only an Owner or Admin can manage API keys. Ask one of them if a program needs access.
        </p>
      </>
    )
  }
  return <ApiKeysAdmin role={role} />
}

function ApiKeysAdmin(props: { readonly role: Role }) {
  const keys = useApiKeys(true)
  const feedback = useFeedback()
  const headingRef = useRef<HTMLHeadingElement>(null)
  // The secret of the key just made. It lives here, in this component's state, and nowhere else:
  // not the query cache, not storage, not a URL. Closing the dialog sets it back to null.
  const [secret, setSecret] = useState<{ readonly name: string; readonly value: string } | null>(
    null
  )
  const now = Date.now()
  return (
    <>
      <PageHeader
        eyebrow='Organization'
        title='API keys'
        description='Keys let a program call the public API for your Organization. Each key has scopes, a role ceiling and an expiry, and a revoked key stops working at its next exchange.'
        headingRef={headingRef}
        headingProps={{ tabIndex: -1 }}
      />
      <div className='grid items-start gap-12 lg:grid-cols-12'>
        <Section
          id='create-key'
          title='Create a key'
          description='The secret is shown once, when the key is made.'
          className='lg:sticky lg:top-8 lg:order-2 lg:col-span-4'
        >
          <CreateKeyForm
            role={props.role}
            onCreated={(name, value) => {
              setSecret({ name, value })
              feedback.done('API key created.')
            }}
            onFail={feedback.failed}
          />
        </Section>
        <div className='flex min-w-0 flex-col gap-4 lg:order-1 lg:col-span-8'>
          <p role='status' className='notice'>
            {feedback.notice}
          </p>
          <h2 className='m-0 border-t border-rule-strong pt-4'>All keys</h2>
          <Paged
            noun='API keys'
            emptyText='There are no API keys yet.'
            emptyHint='Create the first one with the form on this page.'
            state={keys.state}
            present={presentApiKey}
          >
            <ul
              className='m-0 list-none divide-y border-y p-0 motion-safe:animate-fade'
              aria-label='API keys'
            >
              {keys.items.map((key) => (
                <KeyItem
                  key={key.id}
                  apiKey={key}
                  now={now}
                  onDone={feedback.done}
                  onFail={feedback.failed}
                />
              ))}
            </ul>
          </Paged>
        </div>
      </div>
      {secret === null ? null : (
        <SecretDialog
          name={secret.name}
          secret={secret.value}
          onClose={() => {
            setSecret(null)
            headingRef.current?.focus()
          }}
        />
      )}
    </>
  )
}

type CreateErrors = { name?: string; scopes?: string; form?: string }

function CreateKeyForm(props: {
  readonly role: Role
  readonly onCreated: (name: string, secret: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<ReadonlySet<ApiKeyScope>>(new Set())
  const [ceiling, setCeiling] = useState<Role>('rep')
  const [expiry, setExpiry] = useState<string>('90')
  const [errors, setErrors] = useState<CreateErrors>({})
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  // An intent whose outcome is unknown holds an idempotency key, so its retry must resend the
  // same body: its expiry date is kept here until the key is dropped. Every other submit counts
  // from now.
  const held = useRef(new Map<string, string | null>())
  const create = useSubmit<{ body: ReturnType<typeof buildBody>; intent: string }>(
    async ({ body, intent }) => {
      const attempt = app.keys.begin(fingerprint.apiKey(intent))
      let created: Awaited<ReturnType<typeof app.apiKeys.createApiKey>>
      try {
        created = await app.apiKeys.createApiKey(body, attempt.key)
      } catch (error) {
        attempt.failed(error)
        if (!outcomeUnknown(error)) {
          held.current.delete(intent)
        }
        throw error
      }
      attempt.succeeded()
      await refresh(app, 'apiKeys')
      if (created.secret === null) {
        // A repeat of an earlier request: core no longer has the secret to give.
        props.onFail()
        setErrors({
          form: 'This key was already created and its secret cannot be shown again. Revoke the key in the list and create another.',
        })
        focusFirstError()
        return
      }
      held.current.delete(intent)
      setName('')
      setScopes(new Set())
      setCeiling('rep')
      setExpiry('90')
      setErrors({})
      props.onCreated(created.name, created.secret)
    },
    {
      onError(error) {
        props.onFail()
        setErrors({ form: presentApiKey(error).message })
        focusFirstError()
      },
    }
  )
  const orderedScopes = API_KEY_AREAS.flatMap((area) => [
    `${area}:read` as ApiKeyScope,
    `${area}:write` as ApiKeyScope,
  ])
  const chosen = orderedScopes.filter((scope) => scopes.has(scope))
  const toggle = (scope: ApiKeyScope) => {
    setScopes((current) => {
      const next = new Set(current)
      if (next.has(scope)) {
        next.delete(scope)
      } else {
        next.add(scope)
      }
      return next
    })
  }
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (create.pending) {
      return
    }
    props.onFail()
    const next: CreateErrors = {}
    const trimmed = name.trim()
    if (trimmed === '' || trimmed.length > MAX_API_KEY_NAME_LENGTH) {
      next.name = `Enter a name of 1 to ${MAX_API_KEY_NAME_LENGTH} characters.`
    }
    if (chosen.length === 0) {
      next.scopes = 'Choose at least one scope.'
    }
    const intent = JSON.stringify([trimmed, chosen, ceiling, expiry])
    const days = EXPIRY_CHOICES.find((choice) => choice.value === expiry)?.days ?? null
    const expiresAt = held.current.has(intent)
      ? (held.current.get(intent) ?? null)
      : days === null
        ? null
        : new Date(Date.now() + days * DAY_MS).toISOString()
    const body = buildBody(trimmed, chosen, ceiling, expiresAt)
    const parsed = createApiKeyRequestSchema.safeParse(body)
    if (next.name === undefined && next.scopes === undefined && !parsed.success) {
      next.form = 'Check the name and scopes, then try again.'
    }
    if (next.name !== undefined || next.scopes !== undefined || next.form !== undefined) {
      setErrors(next)
      focusFirstError()
      return
    }
    setErrors({})
    held.current.set(intent, expiresAt)
    create.submit({ body, intent })
  }
  const ceilings = ROLES.slice(ROLES.indexOf(props.role))
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-labelledby='create-key-heading'
      className='gap-0'
    >
      {errors.form ? (
        <Banner kind='error' innerRef={bannerRef}>
          {errors.form}
        </Banner>
      ) : null}
      <Field
        label='Name'
        name='name'
        autoComplete='off'
        hint='What the key is for, such as "CRM sync".'
        value={name}
        error={errors.name}
        onChange={(event) => setName(event.target.value)}
      />
      <fieldset className='scope-fieldset mb-4' aria-describedby='scopes-hint'>
        <legend className='label-mono'>Scopes</legend>
        <p className='hint' id='scopes-hint'>
          Give the key only what the program needs. Write does not include read.
        </p>
        <table className='scope-grid'>
          <thead>
            <tr>
              <th scope='col'>Area</th>
              <th scope='col'>Read</th>
              <th scope='col'>Write</th>
            </tr>
          </thead>
          <tbody>
            {API_KEY_AREAS.map((area) => (
              <tr key={area}>
                <th scope='row'>{AREA_WORD[area]}</th>
                {(['read', 'write'] as const).map((mode) => {
                  const scope = `${area}:${mode}` as ApiKeyScope
                  return (
                    <td key={mode}>
                      <input
                        type='checkbox'
                        aria-label={`${AREA_WORD[area]}: ${mode}`}
                        checked={scopes.has(scope)}
                        onChange={() => toggle(scope)}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {errors.scopes ? (
          <p className='field-error' role='alert'>
            <strong>Error:</strong> {errors.scopes}
          </p>
        ) : null}
      </fieldset>
      <SelectField
        label='Role ceiling'
        name='roleCeiling'
        value={ceiling}
        options={ceilings.map((value) => ({ value, text: ROLE_LABEL[value] }))}
        onChange={(event) => {
          const next = ROLES.find((value) => value === event.target.value)
          setCeiling(next ?? 'rep')
        }}
      />
      <SelectField
        label='Expires after'
        name='expiry'
        value={expiry}
        options={EXPIRY_CHOICES.map(({ value, text }) => ({ value, text }))}
        onChange={(event) => setExpiry(event.target.value)}
      />
      <div>
        <button type='submit' className='button w-full' aria-disabled={create.pending}>
          {create.pending ? 'Creating...' : 'Create key'}
        </button>
      </div>
    </form>
  )
}

function buildBody(
  name: string,
  scopes: readonly ApiKeyScope[],
  roleCeiling: Role,
  expiresAt: string | null
) {
  return { name, scopes: [...scopes], roleCeiling, expiresAt }
}

function KeyItem(props: {
  readonly apiKey: ApiKey
  readonly now: number
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const { apiKey } = props
  const app = useApp()
  const label = plain(apiKey.name, 'this key')
  const state = stateOf(apiKey, props.now)
  const [error, setError] = useState<string | null>(null)
  const errorId = `${apiKey.id}-error`
  const revoke = useSubmit<void>(
    async () => {
      setError(null)
      const attempt = app.keys.begin(fingerprint.apiKeyRevoke(apiKey.id))
      try {
        await app.apiKeys.revokeApiKey(apiKey.id, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      await refresh(app, 'apiKeys')
      props.onDone('API key revoked.')
    },
    {
      onError: (failure) => {
        props.onFail()
        setError(presentApiKey(failure).message)
      },
    }
  )
  return (
    <li className='py-4'>
      <div className='key-head'>
        <h3 className='item-title key-name m-0 font-serif text-xl font-normal tracking-[-0.01em]'>
          <Untrusted value={apiKey.name} />
        </h3>
        {state === 'Active' ? (
          <div className='row-actions'>
            <Confirm
              label='Revoke'
              accessibleName={`Revoke ${label}`}
              pendingAccessibleName={`Revoking ${label}`}
              pendingLabel='Revoking...'
              question={
                <>
                  Revoke the key <Untrusted value={apiKey.name} />? Programs using it can no longer
                  exchange it for a token, and tokens already issued stop working within 10 minutes.
                </>
              }
              tone='quiet-destructive'
              confirmLabel='Revoke key'
              pending={revoke.pending}
              describedBy={error ? errorId : undefined}
              onConfirm={() => revoke.submit()}
            />
          </div>
        ) : null}
      </div>
      <div className='flex min-w-0 flex-col'>
        <span className='label-mono mt-1 block'>
          <span className='secret-prefix'>{apiKey.prefix}</span> · {state}
        </span>
        <span className='hint'>
          Role ceiling {ROLE_LABEL[apiKey.roleCeiling]}. Scopes: {apiKey.scopes.join(', ')}.
        </span>
        <dl className='key-facts'>
          <div>
            <dt>Created</dt>
            <dd>
              <When iso={apiKey.createdAt} />
            </dd>
          </div>
          <div>
            <dt>Last used</dt>
            <dd>{apiKey.lastUsedAt === null ? 'Never used' : <When iso={apiKey.lastUsedAt} />}</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>{apiKey.expiresAt === null ? 'No expiry' : <When iso={apiKey.expiresAt} />}</dd>
          </div>
        </dl>
      </div>
      {error ? (
        <p className='field-error' id={errorId} role='alert'>
          <strong>Error:</strong> {error}
        </p>
      ) : null}
    </li>
  )
}

/** A modal that shows a new key's secret once. Closing it unmounts it, so the secret leaves the page. */
function SecretDialog(props: {
  readonly name: string
  readonly secret: string
  readonly onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')
  useEffect(() => {
    const dialog = ref.current
    if (dialog === null || dialog.open) {
      return
    }
    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
    } else {
      dialog.setAttribute('open', '')
    }
  }, [])
  const copy = () => {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
    if (clipboard === undefined) {
      setCopied('failed')
      return
    }
    clipboard.writeText(props.secret).then(
      () => setCopied('done'),
      () => setCopied('failed')
    )
  }
  return (
    <dialog
      ref={ref}
      className='secret-dialog'
      aria-labelledby='secret-dialog-heading'
      aria-describedby='secret-dialog-body'
      onClose={props.onClose}
    >
      <h2 id='secret-dialog-heading' className='m-0 font-serif text-2xl font-normal'>
        Copy your new key
      </h2>
      <p id='secret-dialog-body' className='mt-2'>
        This is the only time the secret for <Untrusted value={props.name} /> is shown. Store it
        somewhere safe now; if you lose it, revoke the key and create another.
      </p>
      <code className='secret-value' data-testid='secret-value'>
        {props.secret}
      </code>
      <p role='status' className='notice'>
        {copied === 'done' ? 'Copied to the clipboard.' : null}
        {copied === 'failed' ? 'Could not copy. Select the secret and copy it yourself.' : null}
      </p>
      <div className='row-actions'>
        <button type='button' className='button' onClick={copy}>
          Copy secret
        </button>
        <button type='button' className='button button-quiet' onClick={props.onClose}>
          I have stored it
        </button>
      </div>
    </dialog>
  )
}
