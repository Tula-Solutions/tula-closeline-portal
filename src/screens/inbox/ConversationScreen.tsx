import { getRouteApi, Link } from '@tanstack/react-router'
import type { Message } from 'tula-closeline-contract'
import { presentInbox } from '~/api/inbox-messages'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { StatusBadge } from '~/components/app/status-badge'
import { can } from '~/data/permissions'
import { prospectName } from '~/data/prospects'
import {
  useConversation,
  useConversationMessages,
  useMembersByIdsState,
  useProspect,
} from '~/data/queries'
import { useRole } from '~/data/session-role'
import { CHANNEL_WORD, LABEL_WORD, STATE_WORD, writerWord } from '~/screens/inbox/words'
import { Banner } from '~/ui/Banner'
import { Paged } from '~/ui/Paged'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { When } from '~/ui/When'

const route = getRouteApi('/_app/inbox/$conversationId')

/** One Conversation: who is writing now, and its Messages as a transcript, oldest first. */
export function ConversationScreen() {
  const { conversationId } = route.useParams()
  const role = useRole()
  const conversation = useConversation(conversationId)
  const messages = useConversationMessages(conversationId)
  const prospect = useProspect(conversation.data?.prospectId ?? '')
  const repId = conversation.data?.controllerMembershipId ?? null
  const { members } = useMembersByIdsState(
    repId === null ? [] : [repId],
    repId !== null && role !== null && can.viewMembers(role)
  )
  const prospectLabel = conversation.data && prospect.data ? prospectName(prospect.data) : undefined
  useDocumentTitle(prospectLabel ?? 'Conversation')
  if (conversation.isPending) {
    return (
      <>
        <PageHeader eyebrow='Inbox' title='Loading...' />
        <p role='status' className='sr-only'>
          Loading the Conversation...
        </p>
      </>
    )
  }
  if (conversation.isError) {
    return (
      <>
        <PageHeader eyebrow='Inbox' title='This Conversation cannot be shown' />
        <Banner kind='error'>{presentInbox(conversation.error).message}</Banner>
        <p>
          <Link to='/inbox'>Back to the inbox</Link>
        </p>
      </>
    )
  }
  const record = conversation.data
  const rep = repId === null ? undefined : members.get(repId)
  const writer = writerWord(record.controller, rep ? rep.name || rep.email : undefined)
  return (
    <>
      <PageHeader
        eyebrow={
          <Link to='/inbox' className='no-underline'>
            Inbox
          </Link>
        }
        title={
          prospectLabel === undefined ? (
            `${CHANNEL_WORD[record.channel]} Conversation`
          ) : (
            <Untrusted value={prospectLabel} />
          )
        }
        description={
          <>
            {CHANNEL_WORD[record.channel]} · last message <When iso={record.lastMessageAt} />
          </>
        }
      />
      <dl className='mb-10 grid gap-x-10 gap-y-4 border-t border-rule-strong pt-4 sm:grid-cols-2 md:grid-cols-4'>
        <Fact term='State'>
          <StatusBadge state={record.state}>{STATE_WORD[record.state]}</StatusBadge>
        </Fact>
        <Fact term='Writing now'>
          <Untrusted value={writer} />
        </Fact>
        <Fact term='Latest label'>
          {record.latestLabel === null ? '—' : LABEL_WORD[record.latestLabel]}
        </Fact>
        <Fact term='Drafts waiting'>
          {record.pendingDraftCount === 0 ? '—' : record.pendingDraftCount}
        </Fact>
      </dl>
      <Section id='messages' title='Messages'>
        <Paged
          noun='Messages'
          present={presentInbox}
          emptyText='No Message yet.'
          emptyHint='Messages appear here as they are sent and received.'
          state={messages.state}
        >
          <ol aria-label='Messages' className='m-0 flex list-none flex-col gap-0 p-0'>
            {messages.items.map((message) => (
              <MessageItem key={message.id} message={message} />
            ))}
          </ol>
        </Paged>
      </Section>
    </>
  )
}

function Fact(props: { readonly term: string; readonly children: React.ReactNode }) {
  return (
    <div>
      <dt className='label-mono mb-1'>{props.term}</dt>
      <dd className='m-0 text-sm'>{props.children}</dd>
    </div>
  )
}

function authorOf(message: Message): string {
  if (message.authorKind === 'prospect') {
    return 'Prospect'
  }
  return message.authorKind === 'agent' ? 'Agent' : 'Rep'
}

function MessageItem(props: { readonly message: Message }) {
  const { message } = props
  const label = message.classification?.label
  return (
    <li className='border-b py-5 first:border-t-0'>
      <p className='label-mono m-0 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1'>
        <span>
          {authorOf(message)} · {message.direction === 'inbound' ? 'received' : 'sent'}
        </span>
        <When iso={message.sentAt} />
        {label === undefined ? null : <span>{LABEL_WORD[label]}</span>}
      </p>
      <p className='m-0 max-w-[68ch] text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap'>
        {message.body}
      </p>
    </li>
  )
}
