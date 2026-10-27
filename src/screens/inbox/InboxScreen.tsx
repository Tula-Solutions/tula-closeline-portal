import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { SlidersHorizontal } from 'lucide-react'
import { useId, useState } from 'react'
import {
  CONVERSATION_STATES,
  type Conversation,
  type ConversationState,
  INBOX_CHANNELS,
  type InboxChannel,
  REPLY_LABELS,
  type ReplyLabel,
  type Role,
} from 'tula-closeline-contract'
import { presentInbox } from '~/api/inbox-messages'
import { PageHeader } from '~/components/app/page-header'
import { StatusBadge } from '~/components/app/status-badge'
import { ESCALATED_COUNT_LIMIT, useConversations, useEscalatedCount } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { cn } from '~/lib/utils'
import { readInboxSearch } from '~/screens/inbox/search'
import { CHANNEL_WORD, LABEL_WORD, STATE_WORD } from '~/screens/inbox/words'
import { Paged } from '~/ui/Paged'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { SelectField } from '~/ui/SelectField'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { When } from '~/ui/When'

const route = getRouteApi('/_app/inbox/')

const CHANNEL_CHOICES = [
  { value: '', text: 'Any channel' },
  ...INBOX_CHANNELS.map((value) => ({ value, text: CHANNEL_WORD[value] })),
]
const STATE_CHOICES = [
  { value: '', text: 'Any state' },
  ...CONVERSATION_STATES.map((value) => ({ value, text: STATE_WORD[value] })),
]
const LABEL_CHOICES = [
  { value: '', text: 'Any label' },
  ...REPLY_LABELS.map((value) => ({ value, text: LABEL_WORD[value] })),
]

/** The Conversations the signed-in member may see (core decides which), narrowed by channel, state and label. */
export function InboxScreen() {
  useDocumentTitle('Inbox')
  const search = readInboxSearch(route.useSearch())
  const navigate = useNavigate({ from: '/inbox/' })
  const conversations = useConversations({
    channel: search.channel,
    state: search.state,
    label: search.label,
  })
  const role = useRole()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtersId = useId()
  const narrowed =
    search.channel !== undefined || search.state !== undefined || search.label !== undefined
  const filterCount = [search.channel, search.state, search.label].filter(
    (value) => value !== undefined
  ).length
  const change = (next: Partial<typeof search>) =>
    void navigate({ search: (now) => ({ ...now, ...next }), replace: true })
  return (
    <>
      <PageHeader
        eyebrow='Sales'
        title='Inbox'
        description='Replies from your Prospects, and who is answering them: the Agent or a Rep. A Rep sees their own Conversations; an Owner or Admin sees every one.'
      />
      <div className='flex flex-col gap-4'>
        <EscalatedToggle
          role={role}
          on={search.state === 'escalated'}
          onChange={(on) => change({ state: on ? 'escalated' : undefined })}
        />
        <button
          type='button'
          className='button button-quiet inline-flex w-fit items-center gap-2 md:hidden'
          aria-expanded={filtersOpen}
          aria-controls={filtersId}
          onClick={() => setFiltersOpen((now) => !now)}
        >
          <SlidersHorizontal aria-hidden='true' className='size-4' />
          {filterCount === 0 ? 'Filters' : `Filters (${filterCount} on)`}
        </button>
        <div
          id={filtersId}
          className={cn(
            'flex-col gap-3 border-t border-rule-strong pt-4 md:flex md:flex-row md:flex-wrap md:items-center md:gap-x-6 md:gap-y-2',
            filtersOpen ? 'flex' : 'hidden'
          )}
        >
          <SelectField
            inline
            label='Channel'
            value={search.channel ?? ''}
            options={CHANNEL_CHOICES}
            onChange={(event) =>
              change({
                channel:
                  event.target.value === '' ? undefined : (event.target.value as InboxChannel),
              })
            }
          />
          <SelectField
            inline
            label='State'
            value={search.state ?? ''}
            options={STATE_CHOICES}
            onChange={(event) =>
              change({
                state:
                  event.target.value === '' ? undefined : (event.target.value as ConversationState),
              })
            }
          />
          <SelectField
            inline
            label='Label'
            value={search.label ?? ''}
            options={LABEL_CHOICES}
            onChange={(event) =>
              change({
                label: event.target.value === '' ? undefined : (event.target.value as ReplyLabel),
              })
            }
          />
        </div>
        <Paged
          noun='Conversations'
          present={presentInbox}
          emptyText={narrowed ? 'No Conversation matches.' : 'Nothing in the inbox yet.'}
          emptyHint={
            narrowed
              ? 'Change the filters, or clear them to see every Conversation you can see.'
              : 'When a Prospect replies to the Agent, the Conversation appears here.'
          }
          emptyAction={
            narrowed ? (
              <button
                type='button'
                className='button'
                onClick={() => void navigate({ search: {}, replace: true })}
              >
                Clear the filters
              </button>
            ) : undefined
          }
          state={conversations.state}
        >
          <ScrollRegion label='Conversations'>
            <table className='ledger-stack' aria-label='Conversations'>
              <thead>
                <tr>
                  <th scope='col'>Conversation</th>
                  <th scope='col'>State</th>
                  <th scope='col' className='ledger-detail'>
                    Label
                  </th>
                  <th scope='col' className='ledger-detail'>
                    Writing now
                  </th>
                  <th scope='col' className='ledger-detail'>
                    Drafts waiting
                  </th>
                </tr>
              </thead>
              <tbody>
                {conversations.items.map((conversation) => (
                  <ConversationRow key={conversation.id} conversation={conversation} />
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        </Paged>
      </div>
    </>
  )
}

function ConversationRow(props: { readonly conversation: Conversation }) {
  const { conversation } = props
  return (
    <tr>
      <th scope='row'>
        <Link to='/inbox/$conversationId' params={{ conversationId: conversation.id }}>
          {CHANNEL_WORD[conversation.channel]} · <When iso={conversation.lastMessageAt} />
        </Link>
      </th>
      <td>
        <StatusBadge state={conversation.state}>{STATE_WORD[conversation.state]}</StatusBadge>
      </td>
      <td className='ledger-detail'>
        {conversation.latestLabel === null ? '—' : LABEL_WORD[conversation.latestLabel]}
      </td>
      <td className='ledger-detail'>{conversation.controller === 'agent' ? 'Agent' : 'Rep'}</td>
      <td className='ledger-detail'>
        {conversation.pendingDraftCount === 0 ? '—' : conversation.pendingDraftCount}
      </td>
    </tr>
  )
}

/**
 * One quiet line above the filters: the Conversations waiting for a person and a single numeral.
 * Core lets a Rep see only their own, so for a Rep the count is theirs; a Manager, Admin or Owner
 * sees every escalation they may see, including the Admin queue (core names no assignee in a list).
 */
function EscalatedToggle(props: {
  readonly role: Role | null
  readonly on: boolean
  readonly onChange: (on: boolean) => void
}) {
  const escalated = useEscalatedCount()
  const mine = props.role === 'rep'
  const label = mine ? 'Escalated to me' : 'Escalated'
  const count = escalated.data
  const numeral =
    count === undefined ? null : count.more ? `${ESCALATED_COUNT_LIMIT}+` : String(count.count)
  return (
    <p className='m-0 flex items-baseline gap-3'>
      <button
        type='button'
        className='button button-quiet'
        aria-pressed={props.on}
        onClick={() => props.onChange(!props.on)}
      >
        {label}
        {numeral === null ? null : (
          <>
            {' '}
            <span className='label-mono'>{numeral}</span>
            <span className='sr-only'> waiting for a person</span>
          </>
        )}
      </button>
    </p>
  )
}
