import { type FormEvent, useState } from 'react'
import {
  type AgentKind,
  MAX_AGENT_INSTRUCTION_LENGTH,
  saveInstructionVersionRequestSchema,
} from 'tula-closeline-contract'
import type { InstructionSummary } from '~/api/agent'
import { presentAgent } from '~/api/agent-messages'
import { fingerprint } from '~/api/idempotency'
import { useApp } from '~/app-context'
import { Section } from '~/components/app/section'
import {
  refresh,
  useInstructionDiff,
  useInstructionVersions,
  usePublishedInstructions,
} from '~/data/queries'
import { KIND_NAME } from '~/screens/agent/words'
import { Banner } from '~/ui/Banner'
import { Confirm } from '~/ui/Confirm'
import { Paged } from '~/ui/Paged'
import { SaveButton } from '~/ui/SaveButton'
import { TextAreaField } from '~/ui/TextAreaField'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

type Callbacks = {
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}

/** The published instructions of one Agent kind; for an Owner or Admin also the editor and every version. */
export function InstructionsSection(
  props: Callbacks & { readonly kind: AgentKind; readonly manage: boolean }
) {
  const { kind } = props
  const published = usePublishedInstructions(kind, true)
  const version = published.data?.version ?? null
  return (
    <Section
      id='instructions'
      title={`${KIND_NAME[kind]}: instructions`}
      description='What the Agent is told about how to sell. New conversations use the published version; those under way finish on the version they started with.'
    >
      {published.isPending ? (
        <p role='status' className='notice'>
          Loading the instructions...
        </p>
      ) : published.isError ? (
        <>
          <Banner kind='error'>{presentAgent(published.error).message}</Banner>
          <button type='button' className='button' onClick={() => void published.refetch()}>
            Try again
          </button>
        </>
      ) : (
        <div className='flex flex-col gap-8'>
          <div>
            <h3 className='m-0 label-mono'>
              {version
                ? `Published: version ${version.number}`
                : 'Nothing is published for this Agent yet'}
            </h3>
            {version ? (
              <>
                <p className='mt-2 mb-0 whitespace-pre-wrap break-words'>
                  <bdi>{version.text}</bdi>
                </p>
                <p className='hint mt-2 mb-0'>
                  Published {version.publishedAt ? <When iso={version.publishedAt} /> : 'earlier'}
                </p>
              </>
            ) : null}
          </div>
          {props.manage ? (
            <>
              <Editor
                key={`${kind}:${version?.number ?? 0}`}
                kind={kind}
                initial={version?.text ?? ''}
                onDone={props.onDone}
                onFail={props.onFail}
              />
              <Versions
                kind={kind}
                publishedNumber={version?.number ?? null}
                onDone={props.onDone}
                onFail={props.onFail}
              />
            </>
          ) : null}
        </div>
      )}
    </Section>
  )
}

function Editor(props: Callbacks & { readonly kind: AgentKind; readonly initial: string }) {
  const app = useApp()
  const [text, setText] = useState(props.initial)
  const [error, setError] = useState<string | undefined>()
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [savedAt, setSavedAt] = useState(0)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const save = useSubmit<string>(
    async (body) => {
      const attempt = app.keys.begin(fingerprint.agentInstruction(props.kind, body))
      try {
        await app.agent.saveVersion(props.kind, body, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      await refresh(app, 'agent')
      setSavedAt(Date.now())
      props.onDone('Saved as a new draft. It is not used until you publish it.')
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentAgent(failure).message)
        focusFirstError()
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (save.pending) {
      return
    }
    props.onFail()
    setError(undefined)
    const parsed = saveInstructionVersionRequestSchema.safeParse({ text })
    if (!parsed.success) {
      setFieldError(
        text.trim() === ''
          ? 'Write the instructions the Agent is given.'
          : `Keep the instructions to ${MAX_AGENT_INSTRUCTION_LENGTH} characters, without control characters.`
      )
      focusFirstError()
      return
    }
    setFieldError(undefined)
    save.submit(parsed.data.text)
  }
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className='max-w-none gap-0'>
      {error === undefined ? null : (
        <Banner kind='error' innerRef={bannerRef}>
          {error}
        </Banner>
      )}
      <TextAreaField
        label='Instructions'
        name='instructions'
        autoComplete='off'
        rows={10}
        hint={`${text.length} of ${MAX_AGENT_INSTRUCTION_LENGTH} characters. Saving makes a new draft; the published version does not change until you publish.`}
        value={text}
        error={fieldError}
        onChange={(event) => setText(event.target.value)}
      />
      <div className='row-actions'>
        <SaveButton pending={save.pending} savedAt={savedAt} pendingLabel='Saving...'>
          Save as new draft
        </SaveButton>
      </div>
    </form>
  )
}

function Versions(
  props: Callbacks & { readonly kind: AgentKind; readonly publishedNumber: number | null }
) {
  const versions = useInstructionVersions(props.kind, true)
  return (
    <div>
      <h3 className='m-0 border-t border-rule-strong pt-4 pb-2 label-mono'>Versions</h3>
      <Paged
        noun='versions'
        emptyText='No version yet.'
        emptyHint='Save the instructions above to make the first one.'
        state={versions.state}
        present={presentAgent}
      >
        <ul
          className='m-0 list-none divide-y border-y p-0 motion-safe:animate-fade'
          aria-label='Versions'
        >
          {versions.items.map((item) => (
            <VersionRow
              key={item.number}
              kind={props.kind}
              item={item}
              publishedNumber={props.publishedNumber}
              onDone={props.onDone}
              onFail={props.onFail}
            />
          ))}
        </ul>
      </Paged>
    </div>
  )
}

function VersionRow(
  props: Callbacks & {
    readonly kind: AgentKind
    readonly item: InstructionSummary
    readonly publishedNumber: number | null
  }
) {
  const { item, kind } = props
  const app = useApp()
  const [comparing, setComparing] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const isPublished = item.number === props.publishedNumber
  // A rollback goes back to a version that was live before, never to a draft that never was.
  const rollback = !isPublished && item.publishedAt !== null
  const publish = useSubmit<void>(
    async () => {
      const attempt = app.keys.begin(fingerprint.agentPublish(kind, item.number))
      try {
        await app.agent.publishVersion(kind, item.number, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      setError(undefined)
      await refresh(app, 'agent')
      props.onDone(
        rollback ? `Rolled back to version ${item.number}.` : `Version ${item.number} is published.`
      )
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentAgent(failure).message)
      },
    }
  )
  const verb = rollback ? 'Roll back' : 'Publish'
  return (
    <li className='py-4'>
      <div className='list-item-head'>
        <div className='flex min-w-0 flex-col'>
          <span className='label-mono block'>
            Version {item.number} ·{' '}
            {isPublished ? 'Published' : item.publishedAt === null ? 'Draft' : 'Earlier'}
          </span>
          <span className='hint mt-1'>
            Saved <When iso={item.createdAt} /> · {item.length} characters
          </span>
        </div>
        {isPublished ? null : (
          <div className='row-actions'>
            {props.publishedNumber === null ? null : (
              <button
                type='button'
                className='button button-quiet'
                aria-label={`Compare version ${item.number} with the published version`}
                aria-expanded={comparing}
                aria-controls={`version-${item.number}-diff`}
                onClick={() => setComparing(!comparing)}
              >
                Compare
              </button>
            )}
            <Confirm
              label={verb}
              accessibleName={`${verb} version ${item.number}`}
              pendingAccessibleName={`${verb === 'Publish' ? 'Publishing' : 'Rolling back to'} version ${item.number}`}
              pendingLabel={verb === 'Publish' ? 'Publishing...' : 'Rolling back...'}
              question={
                <>
                  {rollback
                    ? `Go back to version ${item.number}? `
                    : `Publish version ${item.number}? `}
                  New conversations use it from then on; those under way finish on the version they
                  started with. This is recorded in the audit log.
                </>
              }
              confirmLabel={
                rollback ? `Roll back to version ${item.number}` : `Publish version ${item.number}`
              }
              pending={publish.pending}
              onConfirm={() => publish.submit()}
            />
          </div>
        )}
      </div>
      {error === undefined ? null : (
        <Banner kind='error' className='mt-3 mb-0'>
          {error}
        </Banner>
      )}
      {comparing && props.publishedNumber !== null ? (
        <Diff kind={kind} from={props.publishedNumber} to={item.number} />
      ) : null}
    </li>
  )
}

function Diff(props: { readonly kind: AgentKind; readonly from: number; readonly to: number }) {
  const diff = useInstructionDiff(props.kind, props.from, props.to, true)
  return (
    <div id={`version-${props.to}-diff`} className='mt-4 border-l-2 border-rule-strong pl-4'>
      {diff.isPending ? (
        <p role='status' className='notice'>
          Loading the comparison...
        </p>
      ) : diff.isError ? (
        <Banner kind='error'>{presentAgent(diff.error).message}</Banner>
      ) : (
        <>
          <p className='hint mt-0'>
            Version {props.from} (published) against version {props.to}. A line marked + is added, a
            line marked − is removed.
          </p>
          <ul className='m-0 list-none p-0 font-mono text-sm' aria-label='Differences'>
            {diff.data.lines.map((line, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the lines are a fixed list with no id of their own
              <li key={index} className='flex gap-3 whitespace-pre-wrap break-words'>
                <span aria-hidden='true' className='w-3 shrink-0'>
                  {line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}
                </span>
                <span className='sr-only'>
                  {line.kind === 'added' ? 'Added: ' : line.kind === 'removed' ? 'Removed: ' : ''}
                </span>
                <bdi className={line.kind === 'removed' ? 'line-through' : undefined}>
                  {line.text}
                </bdi>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
