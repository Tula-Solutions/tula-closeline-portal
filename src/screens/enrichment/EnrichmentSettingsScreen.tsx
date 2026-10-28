import { type FormEvent, type ReactNode, useState } from 'react'
import {
  type CreateFitCriterionRequest,
  createFitCriterionRequestSchema,
  type EnrichmentBudget,
  FIELD_GROUPS,
  FIT_FIELDS,
  type FitCondition,
  type FitCriterion,
  type FitField,
  fitConditionSuitsField,
  type ProviderSettings,
  type SetProviderRequest,
  setProviderRequestSchema,
  type Waterfall,
} from 'tula-closeline-contract'
import { presentEnrichment } from '~/api/enrichment-messages'
import { fingerprint } from '~/api/idempotency'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { dollars, fromMicros, GROUP_LABEL, providerName, toMicros } from '~/data/enrichment'
import { refreshEnrichment, useEnrichmentSettings } from '~/data/enrichment-queries'
import { can } from '~/data/permissions'
import { useRole } from '~/data/session-role'
import { Banner } from '~/ui/Banner'
import { Confirm } from '~/ui/Confirm'
import { Field } from '~/ui/Field'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFeedback } from '~/ui/useFeedback'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

const FIELD_WORD: Record<FitField, string> = {
  jobTitle: 'Job title',
  industry: 'Industry',
  employeeCount: 'Employees',
  region: 'Region',
  technologies: 'Technologies',
}

/** Enrichment settings: providers and keys, provider order, budget, spend and Fit Criteria; Owner and Admin only. */
export function EnrichmentSettingsScreen() {
  useDocumentTitle('Enrichment')
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.manageEnrichment(role)) {
    return (
      <>
        <PageHeader eyebrow='Organization' title='Enrichment' />
        <p role='status' className='notice'>
          Only an Owner or Admin can change enrichment settings. Ask one of them if a provider, the
          budget or a Fit Criterion needs to change.
        </p>
      </>
    )
  }
  return <Settings />
}

/** A short non-reversible digest, so a typed key can tell two intents apart without being held. */
function digest(text: string): number {
  let hash = 5381
  for (const char of text) {
    hash = (hash * 33) ^ char.charCodeAt(0)
  }
  return hash >>> 0
}

/** Runs a write under the idempotency key held for this intent, so a retry with an unknown outcome reuses it. */
async function keyed(
  app: ReturnType<typeof useApp>,
  print: string,
  call: (key: string) => Promise<unknown>
) {
  const attempt = app.keys.begin(print)
  try {
    await call(attempt.key)
  } catch (failure) {
    attempt.failed(failure)
    throw failure
  }
  attempt.succeeded()
}

/** Runs one save: reports success, or the reason for the failure in a banner that takes focus. */
function useSave<Input>(
  call: (input: Input, key: string) => Promise<unknown>,
  print: (input: Input) => string,
  done: string,
  onDone: (notice: string) => void,
  onFail: () => void,
  after?: () => void
) {
  const app = useApp()
  const [error, setError] = useState('')
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const save = useSubmit<Input>(
    async (input) => {
      await keyed(app, print(input), (key) => call(input, key))
      setError('')
      after?.()
      await refreshEnrichment(app)
      onDone(done)
    },
    {
      onError(failure) {
        onFail()
        setError(presentEnrichment(failure).message)
        focusFirstError()
      },
    }
  )
  return { ...save, error, setError, formRef, bannerRef, focusFirstError }
}

function FormError(props: {
  readonly error: string
  readonly bannerRef: ReturnType<typeof useFocusOnError>['bannerRef']
}) {
  return props.error ? (
    <Banner kind='error' innerRef={props.bannerRef}>
      {props.error}
    </Banner>
  ) : null
}

function Settings() {
  const feedback = useFeedback()
  const { providers, waterfall, budget, spend, criteria, limit } = useEnrichmentSettings(true)
  const failure = [providers, waterfall, budget, spend, criteria].find((query) => query.isError)
  return (
    <>
      <PageHeader
        eyebrow='Organization'
        title='Enrichment'
        description='Which providers fill in Prospect details, in what order, with what keys, and how much they may spend.'
      />
      <p role='status' className='notice'>
        {feedback.notice}
      </p>
      {failure?.error ? (
        <Banner kind='error'>{presentEnrichment(failure.error).message}</Banner>
      ) : null}
      <div className='flex flex-col gap-12'>
        <Section
          id='providers'
          title='Providers'
          description='Turn a provider on and give it a key. A saved key is never shown again; leave the box empty to keep it.'
        >
          {providers.data?.items.map((provider) => (
            <ProviderForm
              key={`${provider.provider}-${provider.updatedAt ?? ''}`}
              provider={provider}
              onDone={feedback.done}
              onFail={feedback.failed}
            />
          ))}
        </Section>
        <Section
          id='order'
          title='Order'
          description='For each kind of detail, the first provider is asked first and the next ones fill what is still missing.'
        >
          {waterfall.data ? (
            <WaterfallForm
              key={waterfall.data.version}
              waterfall={waterfall.data}
              onDone={feedback.done}
              onFail={feedback.failed}
            />
          ) : null}
        </Section>
        <Section
          id='budget'
          title='Budget'
          description='Enrichment stops when the month or a single run reaches its limit. Amounts are in dollars.'
        >
          {budget.data ? (
            <BudgetForm
              key={budget.data.version}
              budget={budget.data}
              onDone={feedback.done}
              onFail={feedback.failed}
            />
          ) : null}
        </Section>
        <Section id='spend' title='Spend this month' description='What each provider has cost.'>
          {spend.data && spend.data.items.length > 0 ? (
            <ScrollRegion label='Spend by provider' bare>
              <table className='ledger-stack' aria-label='Spend by provider'>
                <thead>
                  <tr>
                    <th scope='col'>Provider</th>
                    <th scope='col'>Calls</th>
                    <th scope='col'>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {spend.data.items.map((entry) => (
                    <tr key={`${entry.month}-${entry.provider}`}>
                      <th scope='row'>{providerName(entry.provider)}</th>
                      <td>{entry.calls}</td>
                      <td>{dollars(entry.costMicros)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          ) : spend.data ? (
            <p className='hint'>Nothing has been spent this month.</p>
          ) : null}
        </Section>
        <Section
          id='fit'
          title='Fit Criteria'
          description='What your ideal customer looks like. A Prospect that matches a criterion earns its weight.'
        >
          {criteria.data ? (
            <FitCriteria
              items={criteria.data.items}
              more={criteria.data.nextCursor !== null}
              limit={limit}
              onDone={feedback.done}
              onFail={feedback.failed}
            />
          ) : null}
        </Section>
      </div>
    </>
  )
}

function ProviderForm(props: {
  readonly provider: ProviderSettings
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const { provider } = props
  const [enabled, setEnabled] = useState(provider.enabled)
  const [apiKey, setApiKey] = useState('')
  const name = providerName(provider.provider)
  const save = useSave<SetProviderRequest>(
    (body, key) => app.outbound.setProvider(provider.provider, body, key),
    (body) =>
      fingerprint.enrichmentWrite(
        'provider',
        provider.provider,
        JSON.stringify([body.enabled, body.apiKey === undefined ? null : digest(body.apiKey ?? '')])
      ),
    `Saved ${name}.`,
    props.onDone,
    props.onFail,
    () => setApiKey('')
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (save.pending) {
      return
    }
    props.onFail()
    const parsed = setProviderRequestSchema.safeParse({
      enabled,
      ...(apiKey === '' ? {} : { apiKey }),
    })
    if (!parsed.success) {
      save.setError('The key must be 8 to 512 printable characters with no spaces at the ends.')
      save.focusFirstError()
      return
    }
    save.setError('')
    save.submit(parsed.data)
  }
  const clearKey = () => save.submit({ enabled: provider.enabled, apiKey: null })
  return (
    <form
      ref={save.formRef}
      onSubmit={onSubmit}
      noValidate
      aria-label={name}
      className='gap-0 border-b py-4'
    >
      <FormError error={save.error} bannerRef={save.bannerRef} />
      <h3 className='m-0 font-serif text-xl font-normal'>{name}</h3>
      <p className='hint'>
        {provider.groups.map((group) => GROUP_LABEL[group]).join(', ')}.{' '}
        {provider.credentialSet ? (
          <>
            Key set
            {provider.credentialUpdatedAt ? (
              <>
                {' '}
                <When iso={provider.credentialUpdatedAt} />
              </>
            ) : null}
            .
          </>
        ) : (
          'No key yet.'
        )}
      </p>
      <label className='mb-3 flex items-center'>
        <input
          type='checkbox'
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        {`Use ${name}`}
      </label>
      <Field
        label={`Key for ${name}`}
        type='password'
        autoComplete='off'
        spellCheck={false}
        value={apiKey}
        placeholder={provider.credentialSet ? 'Saved; type a new key to replace it' : undefined}
        onChange={(event) => setApiKey(event.target.value)}
      />
      <div className='row-actions'>
        <button type='submit' className='button' aria-disabled={save.pending}>
          {save.pending ? 'Saving...' : `Save ${name}`}
        </button>
        {provider.credentialSet ? (
          <Confirm
            label='Remove key'
            accessibleName={`Remove the key for ${name}`}
            pendingAccessibleName={`Removing the key for ${name}`}
            pendingLabel='Removing...'
            question={`Remove the saved key for ${name}? It stops being asked until you add a key.`}
            confirmLabel='Remove key'
            pending={save.pending}
            onConfirm={clearKey}
            tone='quiet-destructive'
          />
        ) : null}
      </div>
    </form>
  )
}

function move<T>(list: readonly T[], index: number, by: -1 | 1): T[] {
  const next = [...list]
  const [item] = next.splice(index, 1)
  if (item !== undefined) {
    next.splice(index + by, 0, item)
  }
  return next
}

function WaterfallForm(props: {
  readonly waterfall: Waterfall
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const [order, setOrder] = useState(props.waterfall.order)
  const save = useSave<Waterfall['order']>(
    (next, key) =>
      app.outbound.setWaterfall({ order: next, expectedVersion: props.waterfall.version }, key),
    (next) =>
      fingerprint.enrichmentWrite(
        'waterfall',
        String(props.waterfall.version),
        JSON.stringify(next)
      ),
    'Saved the provider order.',
    props.onDone,
    props.onFail
  )
  return (
    <form
      ref={save.formRef}
      noValidate
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        if (!save.pending) {
          props.onFail()
          save.submit(order)
        }
      }}
      aria-label='Provider order'
      className='gap-0'
    >
      <FormError error={save.error} bannerRef={save.bannerRef} />
      {FIELD_GROUPS.map((group) => (
        <fieldset key={group} className='mb-4'>
          <legend className='label-mono'>{GROUP_LABEL[group]}</legend>
          <ol className='m-0 list-none p-0'>
            {order[group].map((provider, index) => (
              <li key={provider} className='flex items-center gap-2 py-1'>
                <span className='min-w-40'>{providerName(provider)}</span>
                <button
                  type='button'
                  className='button button-quiet'
                  disabled={index === 0}
                  aria-label={`Move ${providerName(provider)} up in ${GROUP_LABEL[group]}`}
                  onClick={() => setOrder({ ...order, [group]: move(order[group], index, -1) })}
                >
                  Up
                </button>
                <button
                  type='button'
                  className='button button-quiet'
                  disabled={index === order[group].length - 1}
                  aria-label={`Move ${providerName(provider)} down in ${GROUP_LABEL[group]}`}
                  onClick={() => setOrder({ ...order, [group]: move(order[group], index, 1) })}
                >
                  Down
                </button>
              </li>
            ))}
          </ol>
        </fieldset>
      ))}
      <button type='submit' className='button' aria-disabled={save.pending}>
        {save.pending ? 'Saving...' : 'Save order'}
      </button>
    </form>
  )
}

function BudgetForm(props: {
  readonly budget: EnrichmentBudget
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const { budget } = props
  const [limit, setLimit] = useState(fromMicros(budget.monthlyLimitMicros))
  const [ceiling, setCeiling] = useState(fromMicros(budget.perRunCeilingMicros))
  const [errors, setErrors] = useState<{ limit?: string; ceiling?: string }>({})
  const save = useSave<{ monthlyLimitMicros: number; perRunCeilingMicros: number }>(
    (body, key) => app.outbound.setBudget({ ...body, expectedVersion: budget.version }, key),
    (body) => fingerprint.enrichmentWrite('budget', String(budget.version), JSON.stringify(body)),
    'Saved the budget.',
    props.onDone,
    props.onFail
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (save.pending) {
      return
    }
    props.onFail()
    const monthlyLimitMicros = toMicros(limit)
    const perRunCeilingMicros = toMicros(ceiling)
    const next: { limit?: string; ceiling?: string } = {}
    if (monthlyLimitMicros === null) {
      next.limit = 'Enter an amount in dollars, such as 250 or 12.50.'
    }
    if (perRunCeilingMicros === null) {
      next.ceiling = 'Enter an amount in dollars, such as 2 or 0.50.'
    } else if (monthlyLimitMicros !== null && perRunCeilingMicros > monthlyLimitMicros) {
      next.ceiling = 'The limit for one run cannot be more than the monthly limit.'
    }
    setErrors(next)
    if (monthlyLimitMicros === null || perRunCeilingMicros === null || next.ceiling) {
      save.focusFirstError()
      return
    }
    save.submit({ monthlyLimitMicros, perRunCeilingMicros })
  }
  return (
    <form ref={save.formRef} onSubmit={onSubmit} noValidate aria-label='Budget' className='gap-0'>
      <FormError error={save.error} bannerRef={save.bannerRef} />
      <p className='hint'>
        {`Spent ${dollars(budget.spentMicros)} of ${dollars(budget.monthlyLimitMicros)}; ${dollars(budget.remainingMicros)} left until `}
        <When iso={budget.resetsAt} />.
      </p>
      <Field
        label='Monthly limit (dollars)'
        inputMode='decimal'
        autoComplete='off'
        value={limit}
        error={errors.limit}
        onChange={(event) => setLimit(event.target.value)}
      />
      <Field
        label='Limit for one run (dollars)'
        hint='A single request stops when it has cost this much.'
        inputMode='decimal'
        autoComplete='off'
        value={ceiling}
        error={errors.ceiling}
        onChange={(event) => setCeiling(event.target.value)}
      />
      <button type='submit' className='button' aria-disabled={save.pending}>
        {save.pending ? 'Saving...' : 'Save budget'}
      </button>
    </form>
  )
}

function conditionWord(criterion: FitCriterion): ReactNode {
  const { condition } = criterion
  if (condition.operator === 'between') {
    return `between ${condition.min ?? 'any'} and ${condition.max ?? 'any'}`
  }
  return (
    <>
      {condition.operator === 'one_of' ? 'is one of ' : 'contains any of '}
      <Untrusted value={condition.values.join(', ')} />
    </>
  )
}

function FitCriteria(props: {
  readonly items: readonly FitCriterion[]
  readonly more: boolean
  readonly limit: number
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const [error, setError] = useState('')
  const row = useSubmit<{
    readonly print: string
    readonly run: (key: string) => Promise<unknown>
    readonly done: string
  }>(
    async ({ print, run, done }) => {
      await keyed(app, print, run)
      setError('')
      await refreshEnrichment(app)
      props.onDone(done)
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentEnrichment(failure).message)
      },
    }
  )
  return (
    <>
      {error ? <Banner kind='error'>{error}</Banner> : null}
      {props.items.length === 0 ? (
        <p className='hint'>No Fit Criteria yet, so Prospects are not scored.</p>
      ) : (
        <ul className='m-0 list-none divide-y border-y p-0'>
          {props.items.map((criterion) => (
            <li key={criterion.id} className='py-4'>
              <div className='list-item-head'>
                <span className='item-title'>
                  <Untrusted value={criterion.name} />
                </span>
                <span className='label-mono'>{`weight ${criterion.weight}`}</span>
              </div>
              <p className='m-0'>
                {FIELD_WORD[criterion.field]} {conditionWord(criterion)}
                {criterion.enabled ? '' : ' (off)'}
              </p>
              <div className='row-actions'>
                <button
                  type='button'
                  className='button button-quiet'
                  aria-disabled={row.pending}
                  onClick={() =>
                    row.submit({
                      print: fingerprint.enrichmentWrite(
                        'criterion-toggle',
                        criterion.id,
                        String(!criterion.enabled)
                      ),
                      run: (key) =>
                        app.outbound.updateFitCriterion(
                          criterion.id,
                          { enabled: !criterion.enabled },
                          key
                        ),
                      done: criterion.enabled
                        ? 'Turned the criterion off.'
                        : 'Turned the criterion on.',
                    })
                  }
                >
                  {criterion.enabled ? 'Turn off' : 'Turn on'}
                </button>
                <Confirm
                  label='Delete'
                  accessibleName={`Delete the criterion ${criterion.name}`}
                  pendingAccessibleName={`Deleting the criterion ${criterion.name}`}
                  pendingLabel='Deleting...'
                  question='Delete this criterion? Scores are worked out again without it.'
                  confirmLabel='Delete'
                  pending={row.pending}
                  onConfirm={() =>
                    row.submit({
                      print: fingerprint.enrichmentWrite('criterion-delete', criterion.id, ''),
                      run: (key) => app.outbound.deleteFitCriterion(criterion.id, key),
                      done: 'Deleted the criterion.',
                    })
                  }
                  tone='quiet-destructive'
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {props.more ? <p className='hint'>{`Showing the first ${props.limit} criteria.`}</p> : null}
      <AddCriterion onDone={props.onDone} onFail={props.onFail} />
    </>
  )
}

function AddCriterion(props: {
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const [name, setName] = useState('')
  const [field, setField] = useState<FitField>('jobTitle')
  const [values, setValues] = useState('')
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [weight, setWeight] = useState('50')
  const save = useSave<CreateFitCriterionRequest>(
    (body, key) => app.outbound.createFitCriterion(body, key),
    (body) => fingerprint.enrichmentWrite('criterion-add', '', JSON.stringify(body)),
    'Added the criterion.',
    props.onDone,
    props.onFail,
    () => {
      setName('')
      setValues('')
      setMin('')
      setMax('')
    }
  )
  const numeric = field === 'employeeCount'
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (save.pending) {
      return
    }
    props.onFail()
    const bound = (text: string) => (text.trim() === '' ? null : Number(text))
    const condition: FitCondition = numeric
      ? { operator: 'between', min: bound(min), max: bound(max) }
      : {
          operator: field === 'technologies' ? 'contains_any' : 'one_of',
          values: values
            .split(',')
            .map((value) => value.trim())
            .filter((value) => value !== ''),
        }
    const parsed = createFitCriterionRequestSchema.safeParse({
      name: name.trim(),
      field,
      condition,
      weight: Number(weight),
    })
    if (!parsed.success || !fitConditionSuitsField(field, condition)) {
      save.setError(
        'Give the criterion a name, one to twenty values separated by commas (or a size range for employees) and a weight from 1 to 100.'
      )
      save.focusFirstError()
      return
    }
    save.setError('')
    save.submit(parsed.data)
  }
  return (
    <form
      ref={save.formRef}
      onSubmit={onSubmit}
      noValidate
      aria-label='Add a Fit Criterion'
      className='mt-6 gap-0'
    >
      <h3 className='m-0 mb-3 font-serif text-xl font-normal'>Add a criterion</h3>
      <FormError error={save.error} bannerRef={save.bannerRef} />
      <Field label='Name' value={name} onChange={(event) => setName(event.target.value)} />
      <div className='field mb-4 flex flex-col gap-2'>
        <label htmlFor='fit-field'>Looks at</label>
        <select
          id='fit-field'
          value={field}
          onChange={(event) => setField(event.target.value as FitField)}
        >
          {FIT_FIELDS.map((option) => (
            <option key={option} value={option}>
              {FIELD_WORD[option]}
            </option>
          ))}
        </select>
      </div>
      {numeric ? (
        <>
          <Field
            label='At least (employees)'
            inputMode='numeric'
            value={min}
            onChange={(event) => setMin(event.target.value)}
          />
          <Field
            label='At most (employees)'
            inputMode='numeric'
            value={max}
            onChange={(event) => setMax(event.target.value)}
          />
        </>
      ) : (
        <Field
          label='Values'
          hint='Separate with commas.'
          value={values}
          onChange={(event) => setValues(event.target.value)}
        />
      )}
      <Field
        label='Weight (1 to 100)'
        inputMode='numeric'
        value={weight}
        onChange={(event) => setWeight(event.target.value)}
      />
      <button type='submit' className='button' aria-disabled={save.pending}>
        {save.pending ? 'Adding...' : 'Add criterion'}
      </button>
    </form>
  )
}
