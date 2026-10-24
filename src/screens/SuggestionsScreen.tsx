import { useRef, useState } from 'react'
import { SUGGESTION_STATUSES, type SuggestionStatus } from 'tula-closeline-contract'
import { presentSuggestion } from '~/api/suggestion-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { can } from '~/data/permissions'
import { refresh, useLearningSettings, useSuggestions } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { SuggestionEntry } from '~/screens/suggestions/SuggestionEntry'
import { Banner } from '~/ui/Banner'
import { Paged } from '~/ui/Paged'
import { SelectField } from '~/ui/SelectField'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useSubmit } from '~/ui/useSubmit'

const STATUS_LABEL: Readonly<Record<SuggestionStatus, string>> = {
  pending: 'Waiting for review',
  accepted: 'Accepted',
  rejected: 'Rejected',
}

function LearningSwitch() {
  const app = useApp()
  const setting = useLearningSettings(true)
  const [error, setError] = useState('')
  const change = useSubmit<boolean>(
    async (next) => {
      setError('')
      await app.playbook.setLearningSettings({ learnFromAgentMoments: next })
      await refresh(app, 'learning')
    },
    { onError: (failure) => setError(presentSuggestion(failure).message) }
  )
  return (
    <section aria-labelledby='learning-heading' className='border-t border-rule-strong pt-4'>
      <h2 id='learning-heading' className='m-0'>
        Learning
      </h2>
      {setting.isError ? (
        <p className='hint mt-3'>
          Closeline could not read this setting. Reload the page to try again.
        </p>
      ) : setting.data === undefined ? null : (
        <label className='mt-3 flex items-center gap-3 text-sm font-medium'>
          <input
            type='checkbox'
            role='switch'
            aria-checked={setting.data.learnFromAgentMoments}
            checked={setting.data.learnFromAgentMoments}
            disabled={change.pending}
            onChange={(event) => change.submit(event.target.checked)}
            className='size-4 accent-foreground'
          />
          Learn from Agent Moments
        </label>
      )}
      <p className='hint mt-2 max-w-[62ch]'>
        When on, Closeline may draw Suggestions from Moments of calls an Agent handled. Turning it
        off stops new Suggestions from using them and removes nothing already learned. Nothing
        reaches an Agent until you accept it.
      </p>
      {error ? (
        <Banner kind='error' className='mt-3 mb-0'>
          {error}
        </Banner>
      ) : null}
    </section>
  )
}

function Review() {
  const app = useApp()
  const [status, setStatus] = useState<SuggestionStatus>('pending')
  const [notice, setNotice] = useState('')
  const noticeRef = useRef<HTMLParagraphElement>(null)
  const suggestions = useSuggestions(status, true)
  const say = (message: string) => {
    setNotice(message)
    noticeRef.current?.focus()
  }
  return (
    <>
      <LearningSwitch />
      <div className='flex flex-wrap items-end justify-between gap-3 border-t border-rule-strong pt-4'>
        <h2 className='m-0'>Review</h2>
        <SelectField
          inline
          label='Show'
          name='status'
          value={status}
          onChange={(event) => {
            const next = SUGGESTION_STATUSES.find((candidate) => candidate === event.target.value)
            if (next) {
              setStatus(next)
              setNotice('')
            }
          }}
          options={SUGGESTION_STATUSES.map((value) => ({ value, text: STATUS_LABEL[value] }))}
        />
      </div>
      <p ref={noticeRef} tabIndex={-1} role='status' aria-label='Notice' className='notice'>
        {notice}
      </p>
      <Paged
        noun='Suggestions'
        emptyText={status === 'pending' ? 'Nothing to review' : `No ${status} Suggestions`}
        emptyHint={
          status === 'pending'
            ? 'A Suggestion appears here when Closeline finds something worth adding to your Playbook.'
            : 'Decided Suggestions stay here for reference.'
        }
        state={suggestions.state}
        present={presentSuggestion}
      >
        <ol aria-label='Suggestions' className='m-0 list-none border-t p-0'>
          {suggestions.items.map((suggestion) => (
            <SuggestionEntry
              key={suggestion.id}
              suggestion={suggestion}
              onDecided={say}
              onAlreadyDecided={() => {
                say('This Suggestion was already decided by someone else. The list is refreshed.')
                void refresh(app, 'suggestions')
              }}
            />
          ))}
        </ol>
      </Paged>
    </>
  )
}

/**
 * Review of what Closeline proposes to add to the Playbook: each Suggestion with the Deal it came
 * from and the Moments it cites, to accept, edit or reject, and the switch for learning from Agent
 * Moments. Owners and Admins only; for anyone else nothing is requested.
 */
export function SuggestionsScreen() {
  const role = useRole()
  useDocumentTitle(role !== null && !can.managePlaybook(role) ? 'Not allowed' : 'Suggestions')
  if (role === null) {
    return null
  }
  if (!can.managePlaybook(role)) {
    return (
      <PageHeader
        title='Not allowed'
        description='Suggestions are for Owners and Admins. Ask an Owner or Admin of your Organization.'
      />
    )
  }
  return (
    <>
      <PageHeader
        eyebrow='Knowledge'
        title='Suggestions'
        description='What Closeline proposes to add to your Playbook, with the Deal it came from and the Moments it rests on. Nothing is added until you accept it.'
      />
      <div className='page-stack'>
        <Review />
      </div>
    </>
  )
}
