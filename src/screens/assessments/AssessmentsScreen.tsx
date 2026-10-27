import { getRouteApi } from '@tanstack/react-router'
import { AGENT_KINDS, FINDING_CATEGORIES } from 'tula-closeline-contract'
import { presentAssessment } from '~/api/assessment-messages'
import { PageHeader } from '~/components/app/page-header'
import { can } from '~/data/permissions'
import { useAssessmentRates, useAssessments } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { AssessmentEntry } from '~/screens/assessments/AssessmentEntry'
import { CategoryRates } from '~/screens/assessments/CategoryRates'
import { FailureRateChart } from '~/screens/assessments/FailureRateChart'
import {
  type AssessmentSearch,
  assessmentFilter,
  datesProblem,
  mergeAssessmentSearch,
  rateRange,
  todayString,
} from '~/screens/assessments/search'
import { AGENT_WORD, CATEGORY_WORD, VERDICT_WORD } from '~/screens/assessments/words'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { Paged } from '~/ui/Paged'
import { SelectField } from '~/ui/SelectField'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { formatDateOnly } from '~/ui/When'

const route = getRouteApi('/_app/assessments')

const ANY = 'any'
const FLAGGED = 'flagged'

/** The verdicts a person can ask for; "flagged" is warnings and failures, which is what the list shows with no verdict. */
const VERDICT_CHOICES = [
  { value: FLAGGED, text: 'Flagged' },
  { value: 'warn', text: VERDICT_WORD.warn },
  { value: 'fail', text: VERDICT_WORD.fail },
  { value: 'pass', text: VERDICT_WORD.pass },
] as const

/** Assessed Agent output for review: Owners and Admins read it; a Manager or Rep never reaches it and no request is made. */
export function AssessmentsScreen() {
  useDocumentTitle('Assessments')
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.reviewAssessments(role)) {
    return (
      <>
        <PageHeader eyebrow='Analytics' title='Not allowed' />
        <p role='status' className='notice'>
          Only an Owner or Admin can review assessments. Ask one of them if an Agent said something
          that needs a second look.
        </p>
      </>
    )
  }
  return <Review />
}

function Filters(props: {
  readonly search: AssessmentSearch
  readonly problem: string | null
  readonly onChange: (
    next: { [K in keyof AssessmentSearch]: AssessmentSearch[K] | undefined }
  ) => void
}) {
  const { search } = props
  return (
    <section aria-label='Filters' className='mb-8 border-t border-rule-strong pt-4'>
      <div className='grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] items-end gap-x-6'>
        <SelectField
          label='Verdict'
          name='verdict'
          value={search.verdict ?? FLAGGED}
          options={VERDICT_CHOICES.map((choice) => ({ value: choice.value, text: choice.text }))}
          onChange={(event) =>
            props.onChange({
              verdict: VERDICT_CHOICES.map((choice) => choice.value)
                .filter((value) => value !== FLAGGED)
                .find((value) => value === event.target.value),
            })
          }
        />
        <SelectField
          label='Kind of finding'
          name='category'
          value={search.category ?? ANY}
          options={[
            { value: ANY, text: 'Any kind' },
            ...FINDING_CATEGORIES.map((category) => ({
              value: category,
              text: CATEGORY_WORD[category],
            })),
          ]}
          onChange={(event) =>
            props.onChange({ category: FINDING_CATEGORIES.find((c) => c === event.target.value) })
          }
        />
        <SelectField
          label='Agent'
          name='agentKind'
          value={search.agentKind ?? ANY}
          options={[
            { value: ANY, text: 'Both Agents' },
            ...AGENT_KINDS.map((kind) => ({ value: kind, text: AGENT_WORD[kind] })),
          ]}
          onChange={(event) =>
            props.onChange({ agentKind: AGENT_KINDS.find((k) => k === event.target.value) })
          }
        />
        <Field
          label='From'
          name='from'
          type='date'
          value={search.from ?? ''}
          onChange={(event) => props.onChange({ from: event.target.value || undefined })}
        />
        <Field
          label='To'
          name='to'
          type='date'
          value={search.to ?? ''}
          onChange={(event) => props.onChange({ to: event.target.value || undefined })}
        />
      </div>
      {props.problem === null ? null : <Banner kind='error'>{props.problem}</Banner>}
    </section>
  )
}

function Rates(props: { readonly search: AssessmentSearch }) {
  const range = rateRange(props.search, todayString())
  const rates = useAssessmentRates({ ...range, agentKind: props.search.agentKind }, true)
  const byCategory = useAssessmentRates(
    { ...range, agentKind: props.search.agentKind, groupBy: 'category' },
    true
  )
  return (
    <section aria-labelledby='rates-heading' className='mb-12'>
      <h2 id='rates-heading' className='m-0 border-t border-rule-strong pt-4'>
        Failure rate by week
      </h2>
      <p className='hint mt-2 mb-5 max-w-[62ch]'>
        The share of assessed output that failed, {formatDateOnly(range.from)} to{' '}
        {formatDateOnly(range.to)}. A week with fewer than 20 records states no rate.
      </p>
      {rates.isPending ? (
        <p role='status' className='hint'>
          Loading the failure rate…
        </p>
      ) : rates.isError ? (
        <>
          <Banner kind='error'>{presentAssessment(rates.error).message}</Banner>
          <button type='button' className='button button-quiet' onClick={rates.refetch}>
            Try again
          </button>
        </>
      ) : rates.items.length === 0 ? (
        <p className='hint'>No output was assessed in these weeks.</p>
      ) : (
        <FailureRateChart items={rates.items} />
      )}
      <h3 id='category-rates-heading' className='mt-10 mb-1'>
        By kind of finding
      </h3>
      <p className='hint mt-0 mb-4 max-w-[62ch]'>
        The same weeks split by what the assessment found wrong. A dash means no rate is stated:
        fewer than 20 records.
      </p>
      {byCategory.isPending ? (
        <p role='status' className='hint'>
          Loading the failure rate by kind of finding…
        </p>
      ) : byCategory.isError ? (
        <>
          <Banner kind='error'>{presentAssessment(byCategory.error).message}</Banner>
          <button type='button' className='button button-quiet' onClick={byCategory.refetch}>
            Try again
          </button>
        </>
      ) : byCategory.items.length === 0 ? (
        <p className='hint'>No output was assessed in these weeks.</p>
      ) : (
        <>
          {byCategory.truncated ? (
            <p role='status' className='hint mb-4'>
              Showing weeks up to{' '}
              {formatDateOnly([...byCategory.items.map((i) => i.weekStart)].sort().at(-1) ?? '')}.
              Choose a shorter range to see later weeks.
            </p>
          ) : null}
          <CategoryRates items={byCategory.items} />
        </>
      )}
    </section>
  )
}

function Review() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const problem = datesProblem(search)
  const assessments = useAssessments(assessmentFilter(search), true)
  const change = (next: { [K in keyof AssessmentSearch]: AssessmentSearch[K] | undefined }) => {
    void navigate({ search: mergeAssessmentSearch(search, next), replace: true })
  }
  return (
    <>
      <PageHeader
        eyebrow='Analytics'
        title='Assessments'
        description='Agent output that was checked after it was written: what is wrong with it, how serious, and the sentence it points at. Tell Closeline which findings were right so it can tell how often it is wrong.'
      />
      <Rates search={search} />
      <h2 className='m-0 border-t border-rule-strong pt-4'>Review</h2>
      <Filters search={search} problem={problem} onChange={change} />
      <Paged
        noun='assessments'
        emptyText='Nothing to review'
        emptyHint='No assessed output matches these filters. Widen the dates or choose another verdict.'
        state={assessments.state}
        present={presentAssessment}
      >
        <ol aria-label='Assessments' className='m-0 list-none border-t p-0'>
          {assessments.items.map((assessment) => (
            <AssessmentEntry key={assessment.id} assessment={assessment} />
          ))}
        </ol>
      </Paged>
    </>
  )
}
