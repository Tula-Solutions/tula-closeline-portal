import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_SEARCH_LIMIT,
  isWellFormedText,
  MAX_SEARCH_LIMIT,
  MAX_SEARCH_TEXT_CHARACTERS,
  MAX_SEARCH_TURNS,
  type SearchMomentsRequest,
  searchMomentsRequestSchema,
} from 'tula-closeline-contract'
import { presentSales } from '~/api/sales-messages'
import { Banner } from '~/ui/Banner'
import { SelectField } from '~/ui/SelectField'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

type TurnRole = 'rep' | 'prospect'
type Turn = { readonly key: number; readonly role: TurnRole; readonly text: string }

/** The choices of how many results to ask for. */
const LIMITS = [DEFAULT_SEARCH_LIMIT, 10, MAX_SEARCH_LIMIT] as const

const ROLE_OPTIONS = [
  { value: 'rep', text: 'Rep' },
  { value: 'prospect', text: 'Prospect' },
]

/** A score as a whole percentage, or null when it is not a closeness between 0 and 1 that a person can read. */
export function percent(score: number): number | null {
  return Number.isFinite(score) && score >= 0 && score <= 1 ? Math.round(score * 100) : null
}

/** `N word`, with the singular form for one. */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * The form both searches share: a few turns of a conversation, a limit, the checks of the
 * contract's request schema before anything is sent, the failure shown and focused, and the
 * answer dropped by any edit (an answer that arrives after an edit is ignored). What the answer
 * looks like is the caller's: `children` draws it.
 */
export function SearchForm<Answer>(props: {
  readonly label: string
  readonly intro: string
  readonly run: (request: SearchMomentsRequest) => Promise<Answer>
  readonly children: (answer: Answer) => ReactNode
}) {
  const nextKey = useRef(2)
  const [turns, setTurns] = useState<readonly Turn[]>([{ key: 1, role: 'rep', text: '' }])
  const [limit, setLimit] = useState<number>(DEFAULT_SEARCH_LIMIT)
  const [turnErrors, setTurnErrors] = useState<Readonly<Record<number, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState<number | null>(null)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const fields = useRef(new Map<number, HTMLTextAreaElement>())
  useEffect(() => {
    if (focusKey !== null) {
      fields.current.get(focusKey)?.focus()
    }
  }, [focusKey])
  const generation = useRef(0)
  const drop = () => {
    generation.current += 1
    setAnswer(null)
  }
  const search = useSubmit<SearchMomentsRequest>(
    async (request) => {
      const asked = generation.current
      const reply = await props.run(request)
      // An edit made while it was running means the answer is for words no longer on screen.
      if (asked === generation.current) {
        setAnswer(reply)
      }
    },
    {
      onError: (caught) => {
        setFailure(presentSales(caught, 'search').message)
        focusFirstError()
      },
    }
  )
  const used = turns.reduce((sum, turn) => sum + [...turn.text].length, 0)
  const change = (key: number, edit: Partial<Turn>) => {
    // The answer belongs to the words it was asked with: any edit drops it.
    drop()
    setTurns((all) => all.map((turn) => (turn.key === key ? { ...turn, ...edit } : turn)))
  }
  return (
    <>
      <p className='mb-6 max-w-prose text-muted-foreground'>{props.intro}</p>
      <form
        ref={formRef}
        noValidate
        aria-label={props.label}
        onSubmit={(event) => {
          event.preventDefault()
          setFailure(null)
          drop()
          const errors: Record<number, string> = {}
          let form: string | null = null
          const limitMessage = `Keep what was said within ${MAX_SEARCH_TEXT_CHARACTERS} characters in all.`
          for (const turn of turns) {
            if (!isWellFormedText(turn.text)) {
              errors[turn.key] =
                "This turn has characters we can't read. Remove them and try again."
            }
          }
          const total = turns.reduce((sum, turn) => sum + [...turn.text].length, 0)
          if (total > MAX_SEARCH_TEXT_CHARACTERS) {
            // A turn that is too long by itself carries the message; otherwise the whole is too long.
            const long = turns.filter((turn) => [...turn.text].length > MAX_SEARCH_TEXT_CHARACTERS)
            for (const turn of long) {
              errors[turn.key] ??= limitMessage
            }
            if (long.length === 0) {
              form = limitMessage
            }
          }
          const checked = searchMomentsRequestSchema.safeParse({
            turns: turns.map(({ role: who, text }) => ({ role: who, text })),
            limit,
          })
          if (!checked.success) {
            for (const issue of checked.error.issues) {
              const [head, index] = issue.path
              const turn = head === 'turns' && typeof index === 'number' ? turns[index] : undefined
              if (turn === undefined) {
                form ??= 'Write what was said, with at least one turn.'
              } else {
                errors[turn.key] ??=
                  turn.text === ''
                    ? 'Write some words in this turn, or remove it.'
                    : 'Write some words: a turn of only spaces cannot be searched.'
              }
            }
          }
          if (!checked.success || form !== null || Object.keys(errors).length > 0) {
            setTurnErrors(errors)
            setFormError(form)
            focusFirstError()
            return
          }
          setTurnErrors({})
          setFormError(null)
          search.submit(checked.data)
        }}
      >
        {formError ? (
          <Banner kind='error' innerRef={bannerRef}>
            {formError}
          </Banner>
        ) : null}
        {turns.map((turn, index) => {
          const n = index + 1
          const error = turnErrors[turn.key]
          const errorId = `turn-${turn.key}-error`
          return (
            <fieldset key={turn.key}>
              <legend>Turn {n}</legend>
              <SelectField
                label={`Role, turn ${n}`}
                name={`role-${turn.key}`}
                value={turn.role}
                onChange={(event) =>
                  change(turn.key, { role: event.target.value === 'prospect' ? 'prospect' : 'rep' })
                }
                options={ROLE_OPTIONS}
              />
              <div className='field'>
                <label htmlFor={`turn-${turn.key}`}>{`What was said, turn ${n}`}</label>
                <textarea
                  id={`turn-${turn.key}`}
                  name={`text-${turn.key}`}
                  rows={3}
                  value={turn.text}
                  aria-invalid={error ? 'true' : undefined}
                  aria-describedby={error ? errorId : undefined}
                  ref={(node) => {
                    if (node) {
                      fields.current.set(turn.key, node)
                    } else {
                      fields.current.delete(turn.key)
                    }
                  }}
                  onChange={(event) => {
                    change(turn.key, { text: event.target.value })
                    setTurnErrors((now) => ({ ...now, [turn.key]: '' }))
                    setFormError(null)
                  }}
                />
                {error ? (
                  <p className='field-error' id={errorId}>
                    <strong>Error:</strong> {error}
                  </p>
                ) : null}
              </div>
              {turns.length > 1 ? (
                <button
                  type='button'
                  className='button button-secondary'
                  onClick={() => {
                    drop()
                    setTurns((all) => all.filter((other) => other.key !== turn.key))
                    setFocusKey(turns[index === 0 ? 1 : index - 1]?.key ?? null)
                  }}
                >
                  Remove turn {n}
                </button>
              ) : null}
            </fieldset>
          )
        })}
        <p className='hint'>
          {used} of {MAX_SEARCH_TEXT_CHARACTERS} characters used
        </p>
        {turns.length < MAX_SEARCH_TURNS ? (
          <p>
            <button
              type='button'
              className='button button-secondary'
              onClick={() => {
                const key = nextKey.current
                nextKey.current += 1
                drop()
                setTurns((all) => [
                  ...all,
                  { key, role: all.at(-1)?.role === 'rep' ? 'prospect' : 'rep', text: '' },
                ])
                setFocusKey(key)
              }}
            >
              Add a turn
            </button>
          </p>
        ) : null}
        <SelectField
          label='Number of results'
          name='limit'
          value={String(limit)}
          onChange={(event) => {
            drop()
            setLimit(Number(event.target.value))
          }}
          options={LIMITS.map((value) => ({ value: String(value), text: String(value) }))}
        />
        <button type='submit' className='button' aria-disabled={search.pending}>
          {search.pending ? 'Searching...' : 'Search'}
        </button>
      </form>
      {failure ? (
        <Banner kind='error' innerRef={bannerRef}>
          {failure}
        </Banner>
      ) : null}
      {answer === null ? null : props.children(answer)}
    </>
  )
}
