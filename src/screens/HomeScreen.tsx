import { Link, type LinkProps } from '@tanstack/react-router'
import {
  BookOpen,
  ChevronRight,
  FileSearch,
  FileText,
  House,
  type LucideIcon,
  Phone,
  Trophy,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { StatTile, type StatValue } from '~/components/app/stat-tile'
import { StatusBadge } from '~/components/app/status-badge'
import { Skeleton } from '~/components/ui/skeleton'
import { stateLabel } from '~/data/documents'
import { can } from '~/data/permissions'
import { useCalls, useDeals, useDocuments, useMembers } from '~/data/queries'
import { useRole } from '~/data/session-role'
import type { PagedState } from '~/ui/Paged'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { When } from '~/ui/When'

/** A list's first page as a tile count: what was read, and whether more pages exist beyond it. */
function statOf(state: PagedState, count: number): StatValue {
  if (state.isPending) {
    return { kind: 'loading' }
  }
  if (state.isError && !state.hasData) {
    return { kind: 'unavailable' }
  }
  return { kind: 'count', count, more: state.hasNextPage }
}

function MembersTile() {
  const members = useMembers(true)
  return (
    <StatTile
      label='Members'
      icon={Users}
      value={statOf(members.state, members.items.length)}
      to='/members'
      hint='People in your Organization'
    />
  )
}

function WonDealsTile() {
  const deals = useDeals({ outcome: 'won', unseen: false })
  return (
    <StatTile
      label='Won Deals'
      icon={Trophy}
      value={statOf(deals.state, deals.items.length)}
      to='/sales-history/deals'
      hint='The Deals search learns from'
    />
  )
}

function CallsTile() {
  const calls = useCalls({})
  return (
    <StatTile
      label='Calls'
      icon={Phone}
      value={statOf(calls.state, calls.items.length)}
      to='/sales-history/calls'
      hint='Transcripts and Recordings'
    />
  )
}

type Action = {
  readonly to: LinkProps['to']
  readonly icon: LucideIcon
  readonly title: string
  readonly text: string
}

function ActionRow(props: { readonly action: Action }) {
  const Icon = props.action.icon
  return (
    <li>
      <Link
        to={props.action.to}
        className='group flex items-center gap-3 px-5 py-3.5 transition-colors duration-150 outline-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset'
      >
        <span
          aria-hidden='true'
          className='flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-primary shadow-elev-1'
        >
          <Icon className='size-4' />
        </span>
        <span className='flex min-w-0 flex-1 flex-col'>
          <span className='text-sm font-semibold text-foreground'>{props.action.title}</span>
          <span className='text-[0.8125rem] text-muted-foreground'>{props.action.text}</span>
        </span>
        <ChevronRight
          aria-hidden='true'
          className='size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-snappy group-hover:translate-x-0.5 group-hover:text-foreground'
        />
      </Link>
    </li>
  )
}

/** The newest documents of the first page the Playbook screen also reads. Names are text only, never links. */
function RecentDocuments(props: { readonly documents: ReturnType<typeof useDocuments> }) {
  const { state, items } = props.documents
  const recent = items.slice(0, 5)
  return (
    <Section
      id='recent-documents'
      icon={FileText}
      title='Recent documents'
      description='The newest sales material in your Playbook.'
      flush
      actions={
        <Link
          to='/playbook'
          className='rounded-md px-2 py-1 text-[0.8125rem] font-semibold text-primary outline-none hover:bg-primary/10 focus-visible:ring-[3px] focus-visible:ring-ring'
        >
          View all
        </Link>
      }
    >
      {state.isPending ? (
        <ul aria-hidden='true' className='m-0 list-none divide-y p-0'>
          {[0, 1, 2].map((row) => (
            <li key={row} className='flex items-center gap-3 px-5 py-3.5'>
              <Skeleton className='size-8 rounded-lg' />
              <Skeleton className='h-3 flex-1' />
              <Skeleton className='h-5 w-16 rounded-full' />
            </li>
          ))}
        </ul>
      ) : recent.length === 0 ? (
        <p className='m-0 px-5 py-8 text-center text-sm text-muted-foreground'>
          {state.isError
            ? 'The documents could not be loaded. Open the Playbook to try again.'
            : 'No documents yet. Upload your first one from the Playbook.'}
        </p>
      ) : (
        <ul className='m-0 list-none divide-y p-0'>
          {recent.map((document) => (
            <li key={document.id} className='flex items-center gap-3 px-5 py-3'>
              <span
                aria-hidden='true'
                className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'
              >
                <FileText className='size-4' />
              </span>
              <span className='flex min-w-0 flex-1 flex-col'>
                <span className='text-sm font-medium'>
                  <Untrusted value={document.fileName} />
                </span>
                <span className='text-xs text-muted-foreground tabular-nums'>
                  <When iso={document.createdAt} />
                </span>
              </span>
              <StatusBadge state={document.state}>{stateLabel(document.state)}</StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/** The home page of the dashboard: the Organization's numbers, the newest documents and what to do next, by role. */
export function HomeScreen() {
  useDocumentTitle('Home')
  const role = useRole()
  const documents = useDocuments(undefined)
  if (role === null) {
    return null
  }
  const actions: Action[] = []
  if (can.manageInvitations(role)) {
    actions.push({
      to: '/invitations',
      icon: UserPlus,
      title: 'Invite people',
      text: 'Bring your Reps and Managers into Closeline.',
    })
  }
  actions.push({
    to: '/playbook',
    icon: can.managePlaybook(role) ? Upload : BookOpen,
    title: can.managePlaybook(role) ? 'Upload documents' : 'Open the Playbook',
    text: 'The sales material your Agents and Reps draw on.',
  })
  if (can.searchDocuments(role)) {
    actions.push({
      to: '/playbook/search',
      icon: FileSearch,
      title: 'Search the Playbook',
      text: 'Type what was said and see the text that answers it.',
    })
  }
  if (can.manageSalesHistory(role)) {
    actions.push({
      to: '/sales-history/calls',
      icon: Phone,
      title: 'Upload a Call',
      text: 'Add a Transcript or Recording to a Deal.',
    })
  }
  return (
    <>
      <PageHeader
        icon={House}
        title='Home'
        description='Your Organization at a glance, and where to pick up.'
      />
      <div className='flex flex-col gap-6'>
        <ul
          aria-label='Your Organization in numbers'
          className='m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-4'
        >
          {can.viewMembers(role) ? <MembersTile /> : null}
          <StatTile
            label='Documents'
            icon={BookOpen}
            value={statOf(documents.state, documents.items.length)}
            to='/playbook'
            hint='Sales material in the Playbook'
          />
          {can.manageSalesHistory(role) ? <WonDealsTile /> : null}
          {can.manageSalesHistory(role) ? <CallsTile /> : null}
        </ul>
        <div className='grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'>
          <RecentDocuments documents={documents} />
          <Section
            id='quick-actions'
            title='Quick actions'
            description='Where your Organization needs you next.'
            flush
          >
            <ul className='m-0 list-none divide-y p-0'>
              {actions.map((action) => (
                <ActionRow key={action.title} action={action} />
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </>
  )
}
