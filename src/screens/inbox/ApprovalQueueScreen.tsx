import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { type ApprovalQueueItem, INBOX_CHANNELS, type InboxChannel } from 'tula-closeline-contract'
import { presentInbox } from '~/api/inbox-messages'
import { PageHeader } from '~/components/app/page-header'
import { useApprovalQueue } from '~/data/queries'
import { CHANNEL_WORD, HOLD_WORD } from '~/screens/inbox/words'
import { Paged } from '~/ui/Paged'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { When } from '~/ui/When'

const route = getRouteApi('/_app/inbox/approvals/')

const CHANNEL_CHOICES = [
  { value: '', text: 'Any channel' },
  ...INBOX_CHANNELS.map((value) => ({ value, text: CHANNEL_WORD[value] })),
]

/** The Drafts waiting for a person to approve, oldest first, narrowed by channel. */
export function ApprovalQueueScreen() {
  useDocumentTitle('Approval queue')
  const search = route.useSearch()
  const navigate = useNavigate({ from: '/inbox/approvals/' })
  const queue = useApprovalQueue({ channel: search.channel })
  const narrowed = search.channel !== undefined
  return (
    <>
      <PageHeader
        eyebrow='Sales'
        title='Approval queue'
        description='Replies the Agent wrote that wait for a person before they are sent, the longest wait first. A Rep sees the Drafts of their own Conversations; an Owner or Admin sees every one.'
      />
      <div className='flex flex-col gap-4'>
        <div className='flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-rule-strong pt-4'>
          <SelectField
            inline
            label='Channel'
            value={search.channel ?? ''}
            options={CHANNEL_CHOICES}
            onChange={(event) =>
              void navigate({
                search:
                  event.target.value === '' ? {} : { channel: event.target.value as InboxChannel },
                replace: true,
              })
            }
          />
        </div>
        <Paged
          noun='Drafts'
          present={presentInbox}
          emptyText='No Draft is waiting for approval.'
          emptyHint={
            narrowed
              ? 'None on this channel. Choose another channel to look further.'
              : 'When the Agent writes a reply that needs a person, it appears here.'
          }
          state={queue.state}
        >
          <ScrollRegion label='Drafts'>
            <table className='ledger-stack' aria-label='Drafts waiting for approval'>
              <thead>
                <tr>
                  <th scope='col'>Reply</th>
                  <th scope='col'>Channel</th>
                  <th scope='col' className='ledger-detail'>
                    Why it waits
                  </th>
                  <th scope='col' className='ledger-detail'>
                    Confidence
                  </th>
                  <th scope='col' className='ledger-detail'>
                    Waiting since
                  </th>
                </tr>
              </thead>
              <tbody>
                {queue.items.map((item) => (
                  <QueueRow key={item.draft.id} item={item} />
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        </Paged>
      </div>
    </>
  )
}

function QueueRow(props: { readonly item: ApprovalQueueItem }) {
  const { draft } = props.item
  return (
    <tr>
      <th scope='row'>
        <Link to='/inbox/approvals/$draftId' params={{ draftId: draft.id }}>
          <Untrusted value={draft.body} />
        </Link>
        {draft.ungrounded ? (
          <span className='label-mono mt-1 block'>No Playbook source</span>
        ) : null}
      </th>
      <td>{CHANNEL_WORD[props.item.channel]}</td>
      <td className='ledger-detail'>{draft.hold === null ? '—' : HOLD_WORD[draft.hold]}</td>
      <td className='ledger-detail'>
        {draft.confidence === null ? '—' : `${Math.round(draft.confidence * 100)}%`}
      </td>
      <td className='ledger-detail'>
        <When iso={draft.createdAt} />
      </td>
    </tr>
  )
}
