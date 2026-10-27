import { type DragEvent, type FormEvent, useRef, useState } from 'react'
import {
  createQualificationQuestionRequestSchema,
  MAX_QUALIFICATION_QUESTIONS,
  MAX_SKIP_CONDITIONS,
  QUALIFICATION_QUESTION_KINDS,
  type QualificationQuestion,
  type QualificationQuestionKind,
  type QualificationValue,
  SKIP_OPERATORS,
  type SkipCondition,
  updateQualificationQuestionRequestSchema,
} from 'tula-closeline-contract'
import { presentAgent } from '~/api/agent-messages'
import { fingerprint } from '~/api/idempotency'
import { useApp } from '~/app-context'
import { Section } from '~/components/app/section'
import { questionsKey, useOrganizationId, useQualificationQuestions } from '~/data/queries'
import { OPERATOR_WORD, QUESTION_KIND_WORD } from '~/screens/agent/words'
import { Banner } from '~/ui/Banner'
import { Confirm } from '~/ui/Confirm'
import { Field } from '~/ui/Field'
import { SaveButton } from '~/ui/SaveButton'
import { SelectField } from '~/ui/SelectField'
import { TextAreaField } from '~/ui/TextAreaField'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

type Callbacks = {
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}

const NO_VALUE: ReadonlySet<string> = new Set(['answered', 'not_answered'])

/** How a skip condition reads, naming the question it looks at by its place in the list. */
function skipSummary(skip: SkipCondition, all: readonly QualificationQuestion[]) {
  const target = all.find((item) => item.id === skip.questionId)
  const subject = target ? `question ${target.position}` : 'a question that no longer exists'
  const value =
    skip.value === undefined || NO_VALUE.has(skip.operator)
      ? ''
      : ` ${typeof skip.value === 'boolean' ? (skip.value ? 'yes' : 'no') : skip.value}`
  return `${subject} ${OPERATOR_WORD[skip.operator]}${value}`
}

/** The Qualification questions the Inbound Agent asks, in order: Owner and Admin write and reorder, a Manager reads. */
export function QuestionsSection(props: Callbacks & { readonly manage: boolean }) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const questions = useQualificationQuestions(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | undefined>()
  const [announcement, setAnnouncement] = useState('')
  const [moving, setMoving] = useState(false)
  const busy = useRef(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const items = questions.data ?? []
  const reload = () => app.queryClient.invalidateQueries({ queryKey: questionsKey(organizationId) })

  const remove = useSubmit<QualificationQuestion>(
    async (question) => {
      await app.voice.deleteQuestion(question.id)
      setError(undefined)
      await reload()
      setAnnouncement(`Question ${question.position} deleted.`)
      props.onDone('Question deleted.')
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentAgent(failure).message)
      },
    }
  )

  /** Moves a question to a place (0-based) at once, then asks; a refusal puts the list back. */
  async function move(id: string, to: number) {
    const from = items.findIndex((item) => item.id === id)
    const moved = items[from]
    if (busy.current || !moved || to < 0 || to >= items.length || to === from) {
      return
    }
    busy.current = true
    setMoving(true)
    const previous = items
    const next = [...items]
    next.splice(from, 1)
    next.splice(to, 0, moved)
    const ordered = next.map((item, index) => ({ ...item, position: index + 1 }))
    const key = questionsKey(organizationId)
    app.queryClient.setQueryData(key, ordered)
    setAnnouncement(`${moved.prompt}, moved to position ${to + 1} of ${items.length}.`)
    setError(undefined)
    const ids = ordered.map((item) => item.id)
    const attempt = app.keys.begin(fingerprint.agentQuestionOrder(ids.join(',')))
    try {
      await app.voice.reorderQuestions(ids, attempt.key)
      attempt.succeeded()
      await reload()
    } catch (failure) {
      attempt.failed(failure)
      app.queryClient.setQueryData(key, previous)
      void reload() // a delete or edit may have landed meanwhile, so show the server's list
      setAnnouncement(`The move did not happen. ${moved.prompt} is back at position ${from + 1}.`)
      props.onFail()
      setError(presentAgent(failure).message)
    } finally {
      busy.current = false
      setMoving(false)
    }
  }

  const drop = (event: DragEvent, index: number) => {
    event.preventDefault()
    const id = dragging
    setDragging(null)
    setOver(null)
    if (id !== null) {
      void move(id, index)
    }
  }

  return (
    <Section
      id='questions'
      title='Inbound Agent: qualification questions'
      description='What the Inbound Agent asks a caller, in this order. A question is skipped when its skip logic holds, and skip logic can only look at a question above it.'
      actions={
        props.manage && editing !== 'new' && items.length < MAX_QUALIFICATION_QUESTIONS ? (
          <button type='button' className='button' onClick={() => setEditing('new')}>
            Add a question
          </button>
        ) : null
      }
    >
      <p role='status' className='sr-only'>
        {announcement}
      </p>
      {error === undefined ? null : <Banner kind='error'>{error}</Banner>}
      {editing === 'new' ? (
        <div className='mb-6 border-l-2 border-rule-strong pl-4'>
          <QuestionForm
            earlier={items}
            onDone={(notice) => {
              setEditing(null)
              props.onDone(notice)
            }}
            onFail={props.onFail}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : null}
      {questions.isPending ? (
        <p role='status' className='notice'>
          Loading the questions...
        </p>
      ) : questions.isError ? (
        <>
          <Banner kind='error'>{presentAgent(questions.error).message}</Banner>
          <button type='button' className='button' onClick={() => void questions.refetch()}>
            Try again
          </button>
        </>
      ) : items.length === 0 ? (
        <p className='m-0 max-w-[60ch]'>
          No questions yet, so the Inbound Agent qualifies nobody before it hands over or books.
          {props.manage ? ' Add the first one above.' : ''}
        </p>
      ) : (
        <>
          {props.manage ? (
            <p className='hint mt-0 mb-3'>
              Move a question with its Move up and Move down buttons, or drag its row.
            </p>
          ) : null}
          <ol
            className='m-0 list-none divide-y border-y p-0 motion-safe:animate-fade'
            aria-label='Qualification questions'
          >
            {items.map((question, index) => (
              <li
                key={question.id}
                className={`py-4 ${over === question.id && dragging !== question.id ? 'border-t-2 border-t-foreground' : ''} ${dragging === question.id ? 'opacity-60' : ''}`}
                draggable={props.manage && editing === null}
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', question.id)
                  event.dataTransfer.effectAllowed = 'move'
                  setDragging(question.id)
                }}
                onDragOver={(event) => {
                  if (dragging !== null) {
                    event.preventDefault()
                    setOver(question.id)
                  }
                }}
                onDrop={(event) => drop(event, index)}
                onDragEnd={() => {
                  setDragging(null)
                  setOver(null)
                }}
              >
                <div className='list-item-head'>
                  <div className='flex min-w-0 gap-4'>
                    <span className='label-mono w-8 shrink-0' aria-hidden='true'>
                      {String(question.position).padStart(2, '0')}
                    </span>
                    <div className='flex min-w-0 flex-col'>
                      <span className='break-words'>
                        <span className='sr-only'>Question {question.position}: </span>
                        {question.prompt}
                      </span>
                      <span className='hint mt-1'>
                        {QUESTION_KIND_WORD[question.kind]} ·{' '}
                        {question.required ? 'Required' : 'Optional'}
                        {question.choices ? ` · ${question.choices.join(', ')}` : ''}
                      </span>
                      {question.skipWhen.length > 0 ? (
                        <span className='hint mt-1'>
                          Skipped when{' '}
                          {question.skipWhen.map((s) => skipSummary(s, items)).join(' and ')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {props.manage ? (
                    <div className='row-actions'>
                      <button
                        type='button'
                        className='button button-quiet'
                        aria-label={`Move question ${question.position} up`}
                        aria-disabled={moving || index === 0}
                        onClick={() => void move(question.id, index - 1)}
                      >
                        Move up
                      </button>
                      <button
                        type='button'
                        className='button button-quiet'
                        aria-label={`Move question ${question.position} down`}
                        aria-disabled={moving || index === items.length - 1}
                        onClick={() => void move(question.id, index + 1)}
                      >
                        Move down
                      </button>
                      <button
                        type='button'
                        className='button button-quiet'
                        aria-label={`Edit question ${question.position}`}
                        aria-expanded={editing === question.id}
                        aria-controls={`question-${question.id}-form`}
                        onClick={() => setEditing(editing === question.id ? null : question.id)}
                      >
                        Edit
                      </button>
                      <Confirm
                        label='Delete'
                        accessibleName={`Delete question ${question.position}`}
                        pendingAccessibleName={`Deleting question ${question.position}`}
                        pendingLabel='Deleting...'
                        tone='quiet-destructive'
                        question='Calls from now on do not ask it. Answers already given are kept.'
                        confirmLabel='Delete question'
                        pending={remove.pending}
                        onConfirm={() => remove.submit(question)}
                      />
                    </div>
                  ) : null}
                </div>
                {editing === question.id ? (
                  <div
                    id={`question-${question.id}-form`}
                    className='mt-4 border-l-2 border-rule-strong pl-4'
                  >
                    <QuestionForm
                      initial={question}
                      earlier={items.slice(0, index)}
                      onDone={(notice) => {
                        setEditing(null)
                        props.onDone(notice)
                      }}
                      onFail={props.onFail}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </>
      )}
    </Section>
  )
}

type SkipRow = {
  uid: string
  questionId: string
  operator: SkipCondition['operator']
  value: string
}

const INVALID =
  'Check the question: give it wording of up to 500 characters, two to ten choices for a choice question, and a value for each skip test that needs one.'

/** A skip value in the type its question answers in: yes or no, a number, or text. */
function typed(kind: QualificationQuestionKind | undefined, text: string): QualificationValue {
  if (kind === 'yes_no') {
    return text === 'yes'
  }
  return kind === 'number' && text.trim() !== '' ? Number(text) : text
}

function QuestionForm(
  props: Callbacks & {
    readonly initial?: QualificationQuestion
    readonly earlier: readonly QualificationQuestion[]
    readonly onCancel: () => void
  }
) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const { initial } = props
  const [prompt, setPrompt] = useState(initial?.prompt ?? '')
  const [kind, setKind] = useState<QualificationQuestionKind>(initial?.kind ?? 'free_text')
  const [choices, setChoices] = useState((initial?.choices ?? []).join('\n'))
  const [required, setRequired] = useState(initial?.required ?? true)
  const [skips, setSkips] = useState<SkipRow[]>(
    (initial?.skipWhen ?? []).map((skip) => ({
      uid: crypto.randomUUID(),
      questionId: skip.questionId,
      operator: skip.operator,
      value:
        typeof skip.value === 'boolean' ? (skip.value ? 'yes' : 'no') : String(skip.value ?? ''),
    }))
  )
  const [error, setError] = useState<string | undefined>()
  const [savedAt, setSavedAt] = useState(0)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const choiceList = choices
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  const save = useSubmit<Record<string, unknown>>(
    async (body) => {
      if (initial) {
        await app.voice.updateQuestion(
          initial.id,
          updateQualificationQuestionRequestSchema.parse(body)
        )
      } else {
        const parsed = createQualificationQuestionRequestSchema.parse(body)
        const attempt = app.keys.begin(fingerprint.agentQuestion(JSON.stringify(parsed)))
        try {
          await app.voice.createQuestion(parsed, attempt.key)
        } catch (failure) {
          attempt.failed(failure)
          throw failure
        }
        attempt.succeeded()
      }
      await app.queryClient.invalidateQueries({ queryKey: questionsKey(organizationId) })
      setSavedAt(Date.now())
      props.onDone(initial ? 'Question saved.' : 'Question added.')
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
    const body = {
      prompt: prompt.trim(),
      kind,
      choices: kind === 'choice' ? choiceList : null,
      required,
      skipWhen: skips.map((skip) => {
        const target = props.earlier.find((item) => item.id === skip.questionId)
        return NO_VALUE.has(skip.operator)
          ? { questionId: skip.questionId, operator: skip.operator }
          : {
              questionId: skip.questionId,
              operator: skip.operator,
              value: typed(target?.kind, skip.value),
            }
      }),
    }
    const schema = initial
      ? updateQualificationQuestionRequestSchema
      : createQualificationQuestionRequestSchema
    if (!schema.safeParse(body).success) {
      setError(INVALID)
      focusFirstError()
      return
    }
    setError(undefined)
    save.submit(body)
  }
  const setSkip = (index: number, change: Partial<SkipRow>) =>
    setSkips((now) => now.map((row, at) => (at === index ? { ...row, ...change } : row)))
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className='max-w-none gap-0'>
      {error === undefined ? null : (
        <Banner kind='error' innerRef={bannerRef}>
          {error}
        </Banner>
      )}
      <TextAreaField
        label='Question'
        name='question-prompt'
        hint='What the Agent says to the caller.'
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />
      <SelectField
        label='Kind of answer'
        name='question-kind'
        value={kind}
        options={QUALIFICATION_QUESTION_KINDS.map((item) => ({
          value: item,
          text: QUESTION_KIND_WORD[item],
        }))}
        onChange={(event) =>
          setKind(
            QUALIFICATION_QUESTION_KINDS.find((item) => item === event.target.value) ?? 'free_text'
          )
        }
      />
      {kind === 'choice' ? (
        <TextAreaField
          label='Choices'
          name='question-choices'
          hint='One per line, two to ten.'
          value={choices}
          onChange={(event) => setChoices(event.target.value)}
        />
      ) : null}
      <label className='mb-6 flex items-center gap-2'>
        <input
          type='checkbox'
          checked={required}
          onChange={(event) => setRequired(event.target.checked)}
        />
        The caller has to answer
      </label>
      <fieldset className='mb-6 min-w-0 border-0 p-0'>
        <legend className='mb-1 text-sm font-medium'>Skip logic</legend>
        <p className='hint mt-0 mb-2'>
          Skip this question when every test below holds. It can look at a question above it only.
        </p>
        {skips.map((skip, index) => {
          const target = props.earlier.find((item) => item.id === skip.questionId)
          return (
            <div key={skip.uid} className='mb-3 border-b pb-3'>
              <SelectField
                label={`Test ${index + 1}: question`}
                value={skip.questionId}
                options={props.earlier.map((item) => ({
                  value: item.id,
                  text: `${item.position}. ${item.prompt.slice(0, 60)}`,
                }))}
                onChange={(event) => setSkip(index, { questionId: event.target.value })}
              />
              <SelectField
                label={`Test ${index + 1}: it`}
                value={skip.operator}
                options={SKIP_OPERATORS.map((item) => ({ value: item, text: OPERATOR_WORD[item] }))}
                onChange={(event) =>
                  setSkip(index, {
                    operator:
                      SKIP_OPERATORS.find((item) => item === event.target.value) ?? 'equals',
                  })
                }
              />
              {NO_VALUE.has(skip.operator) ? null : target?.kind === 'yes_no' ? (
                <SelectField
                  label={`Test ${index + 1}: value`}
                  value={skip.value === 'yes' ? 'yes' : 'no'}
                  options={[
                    { value: 'yes', text: 'Yes' },
                    { value: 'no', text: 'No' },
                  ]}
                  onChange={(event) => setSkip(index, { value: event.target.value })}
                />
              ) : (
                <Field
                  label={`Test ${index + 1}: value`}
                  type={target?.kind === 'number' ? 'number' : 'text'}
                  value={skip.value}
                  onChange={(event) => setSkip(index, { value: event.target.value })}
                />
              )}
              <button
                type='button'
                className='button button-quiet'
                onClick={() => setSkips((now) => now.filter((_, at) => at !== index))}
              >
                Remove test {index + 1}
              </button>
            </div>
          )
        })}
        {props.earlier.length > 0 && skips.length < MAX_SKIP_CONDITIONS ? (
          <button
            type='button'
            className='button button-quiet'
            onClick={() =>
              setSkips((now) => [
                ...now,
                {
                  uid: crypto.randomUUID(),
                  questionId: props.earlier[0]?.id ?? '',
                  operator: 'answered',
                  value: '',
                },
              ])
            }
          >
            Add a skip test
          </button>
        ) : null}
      </fieldset>
      <div className='row-actions'>
        <SaveButton pending={save.pending} savedAt={savedAt} pendingLabel='Saving...'>
          {initial ? 'Save question' : 'Add question'}
        </SaveButton>
        <button type='button' className='button button-quiet' onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
