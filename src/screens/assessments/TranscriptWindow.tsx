import { useState } from 'react'
import { presentTranscript } from '~/api/assessment-messages'
import { Button } from '~/components/ui/button'
import { can } from '~/data/permissions'
import { useAssessmentTranscript } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { plain } from '~/ui/plain'

const SPEAKER = { agent: 'Agent', prospect: 'Prospect' } as const

/**
 * The turns around an assessed Call turn, set like a printed exchange: speaker, then text, in order,
 * with the assessed turn ruled and named. Read only once asked for and only by a role that may
 * review; turn text is tenant speech, shown as plain text and never put in an address or a log.
 */
export function TranscriptWindow(props: { readonly assessmentId: string }) {
  const role = useRole()
  const [asked, setAsked] = useState(false)
  const allowed = role !== null && can.reviewAssessments(role)
  const transcript = useAssessmentTranscript(props.assessmentId, allowed && asked)
  if (!allowed) {
    return null
  }
  if (!asked) {
    return (
      <Button variant='link' size='sm' className='mt-4 h-auto p-0' onClick={() => setAsked(true)}>
        Read the turns around it
      </Button>
    )
  }
  if (transcript.isPending) {
    return <p className='hint m-0 mt-4'>Reading the transcript…</p>
  }
  if (transcript.isError) {
    return (
      <div className='mt-4' role='alert'>
        <p className='m-0 text-sm'>{presentTranscript(transcript.error).message}</p>
        <Button
          variant='link'
          size='sm'
          className='mt-1 h-auto p-0'
          onClick={() => void transcript.refetch()}
        >
          Try again
        </Button>
      </div>
    )
  }
  return (
    <ol
      aria-label='Transcript around the assessed turn'
      className='m-0 mt-5 max-w-[62ch] list-none border-t p-0'
    >
      {transcript.data.turns.map((turn) => {
        const assessed = turn.index === transcript.data.around
        return (
          <li
            key={turn.index}
            className={`border-b py-3 pl-4 ${assessed ? 'border-l-2 border-l-foreground' : 'border-l-2 border-l-transparent'}`}
          >
            <p className='label-mono m-0'>
              {SPEAKER[turn.role]}, turn {turn.index + 1}
              {assessed ? ', the assessed turn' : ''}
            </p>
            <p className='m-0 mt-1 font-serif text-base leading-snug'>
              <bdi>{plain(turn.text)}</bdi>
            </p>
          </li>
        )
      })}
    </ol>
  )
}
