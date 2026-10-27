import { useState } from 'react'
import type { Assessment, Finding } from 'tula-closeline-contract'
import { assessmentGone, presentAssessment } from '~/api/assessment-messages'
import type { FindingFeedback } from '~/api/assessments'
import { useApp } from '~/app-context'
import { Button } from '~/components/ui/button'
import { refresh, useDraft } from '~/data/queries'
import {
  AGENT_WORD,
  CATEGORY_WORD,
  FEEDBACK_WORD,
  idTail,
  quoteSpan,
  SEVERITY_WORD,
  VERDICT_WORD,
} from '~/screens/assessments/words'
import { Banner } from '~/ui/Banner'
import { plain } from '~/ui/plain'
import { Untrusted } from '~/ui/Untrusted'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

/** The offending sentence of a Draft, read only once asked for; the Call turn's text is not readable yet. */
function DraftQuote(props: { readonly draftId: string; readonly finding: Finding }) {
  const draft = useDraft(props.draftId)
  if (draft.isPending) {
    return <p className='hint m-0'>Reading the Draft…</p>
  }
  if (draft.isError) {
    return <p className='hint m-0'>The Draft could not be read, so the sentence is not shown.</p>
  }
  const quoted = quoteSpan(draft.data.body, props.finding.span)
  return quoted === null ? (
    <p className='hint m-0'>
      The Draft has changed since it was assessed, so the sentence is gone.
    </p>
  ) : (
    <blockquote className='m-0 max-w-[62ch] border-l border-rule-strong pl-4 font-serif text-[1.25rem] leading-snug tracking-[-0.01em]'>
      <bdi>“{plain(quoted)}”</bdi>
    </blockquote>
  )
}

/** One finding: what kind and how serious in words, the sentence it points at, why, and the two ways to answer it. */
function FindingLine(props: {
  readonly assessment: Assessment
  readonly finding: Finding
  readonly onProblem: (message: string) => void
}) {
  const app = useApp()
  const { assessment, finding } = props
  const { subject } = assessment
  const [shown, setShown] = useState(false)
  const give = useSubmit<FindingFeedback>(
    async (feedback) => {
      const attempt = app.keys.begin(JSON.stringify([assessment.id, finding.id, feedback]))
      try {
        await app.assessments.giveFeedback(assessment.id, finding.id, feedback, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      props.onProblem('')
      await refresh(app, 'assessments')
    },
    {
      onError(failure) {
        props.onProblem(presentAssessment(failure).message)
        if (assessmentGone(failure)) {
          void refresh(app, 'assessments')
        }
      },
    }
  )
  const label = `${CATEGORY_WORD[finding.category]}, ${SEVERITY_WORD[finding.severity]}`
  return (
    <li className='mt-4 first:mt-0'>
      <p className='m-0 text-sm'>
        <span className='font-medium'>{label}.</span>{' '}
        <span className='text-muted-foreground'>
          <bdi>{plain(finding.explanation)}</bdi>
        </span>
      </p>
      <div className='mt-2'>
        {subject.kind === 'draft' ? (
          shown ? (
            <DraftQuote draftId={subject.draftId} finding={finding} />
          ) : (
            <Button variant='link' size='sm' className='h-auto p-0' onClick={() => setShown(true)}>
              Quote the sentence
            </Button>
          )
        ) : (
          <p className='hint m-0'>
            Characters {finding.span.start} to {finding.span.end} of turn {subject.turnIndex + 1}.
            The sentence is not shown: a Call's transcript is not available here yet.
          </p>
        )}
      </div>
      <div className='mt-3 flex flex-wrap items-center gap-3'>
        <span className='label-mono'>
          {finding.feedback === null ? 'Is this right?' : FEEDBACK_WORD[finding.feedback]}
        </span>
        {(['correct', 'false_alarm'] as const).map((feedback) => (
          <Button
            key={feedback}
            size='sm'
            variant='outline'
            disabled={give.pending}
            aria-pressed={finding.feedback === feedback}
            aria-label={`${feedback === 'correct' ? 'Correct' : 'False alarm'}: ${label}`}
            onClick={() => give.submit(feedback)}
          >
            {feedback === 'correct' ? 'Correct' : 'False alarm'}
          </Button>
        ))}
      </div>
    </li>
  )
}

/**
 * One assessed Draft or Call turn as a ledger entry: the verdict, the Agent and when, then each
 * finding with its category and severity in words, the sentence it points at, and the feedback
 * actions. Text from the model or a Draft is untrusted and shown as plain text.
 */
export function AssessmentEntry(props: { readonly assessment: Assessment }) {
  const { assessment } = props
  const [problem, setProblem] = useState('')
  const { subject } = assessment
  return (
    <li className='border-b py-7'>
      <p className='hint m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1'>
        <span className='label-mono text-foreground'>{VERDICT_WORD[assessment.verdict]}</span>
        <span>{AGENT_WORD[assessment.agentKind]}</span>
        <span>
          {subject.kind === 'draft'
            ? `Draft ${idTail(subject.draftId)}`
            : `Call ${idTail(subject.callId)}, turn ${subject.turnIndex + 1}`}
        </span>
        {assessment.prospectId === null ? null : (
          <span>
            Prospect <Untrusted value={assessment.prospectId} />
          </span>
        )}
        <When iso={assessment.createdAt} />
      </p>
      {assessment.findings.length === 0 ? (
        <p className='m-0 mt-3 text-sm text-muted-foreground'>No findings.</p>
      ) : (
        <ul className='m-0 mt-4 list-none p-0' aria-label='Findings'>
          {assessment.findings.map((finding) => (
            <FindingLine
              key={finding.id}
              assessment={assessment}
              finding={finding}
              onProblem={setProblem}
            />
          ))}
        </ul>
      )}
      {problem === '' ? null : (
        <Banner kind='error' className='mt-4 mb-0'>
          {problem}
        </Banner>
      )}
    </li>
  )
}
