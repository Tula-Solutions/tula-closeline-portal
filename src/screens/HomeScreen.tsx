import { Link } from '@tanstack/react-router'
import { ArrowRight, BookOpen, FileSearch, type LucideIcon, TrendingUp, Users } from 'lucide-react'
import type { ComponentProps } from 'react'
import { PageHeader } from '~/components/app/page-header'
import { Card, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { can } from '~/data/permissions'
import { useRole } from '~/data/session-role'
import { useDocumentTitle } from '~/ui/useDocumentTitle'

type Shortcut = {
  readonly to: ComponentProps<typeof Link>['to']
  readonly icon: LucideIcon
  readonly title: string
  readonly text: string
  readonly cta: string
}

function ShortcutCard(props: { readonly item: Shortcut }) {
  const Icon = props.item.icon
  return (
    <Card className='group relative gap-3 transition-shadow hover:shadow-md'>
      <CardHeader>
        <span className='mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary'>
          <Icon aria-hidden='true' className='size-5' />
        </span>
        <CardTitle>
          <Link
            to={props.item.to}
            className='outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring'
          >
            {props.item.cta}
          </Link>
        </CardTitle>
        <CardDescription>{props.item.text}</CardDescription>
      </CardHeader>
      <p
        className='flex items-center gap-1 px-5 text-sm font-medium text-primary'
        aria-hidden='true'
      >
        {props.item.title}
        <ArrowRight className='size-4 transition-transform group-hover:translate-x-0.5' />
      </p>
    </Card>
  )
}

/** The home page of the dashboard: where to go next, by what the signed-in role may do. */
export function HomeScreen() {
  useDocumentTitle('Home')
  const role = useRole()
  const shortcuts: Shortcut[] = []
  if (role !== null) {
    shortcuts.push({
      to: '/playbook',
      icon: BookOpen,
      title: 'Playbook',
      cta: 'Open the Playbook documents',
      text: 'The sales material your Agents and Reps draw on.',
    })
    if (can.searchDocuments(role)) {
      shortcuts.push({
        to: '/playbook/search',
        icon: FileSearch,
        title: 'Search',
        cta: 'Search what the Playbook says',
        text: 'Type what was said and see the Playbook text that answers it.',
      })
    }
    if (can.manageSalesHistory(role)) {
      shortcuts.push({
        to: '/sales-history',
        icon: TrendingUp,
        title: 'Sales history',
        cta: 'Review your sales history',
        text: 'Deals, Calls and the won Deals that search learns from.',
      })
    }
    if (can.viewMembers(role)) {
      shortcuts.push({
        to: '/members',
        icon: Users,
        title: 'Members',
        cta: 'See who is in your Organization',
        text: 'Roles, Teams and Invitations for the people you work with.',
      })
    }
  }
  return (
    <>
      <PageHeader
        title='Home'
        description='You are signed in. Pick up where your Organization needs you.'
      />
      <ul className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        {shortcuts.map((item) => (
          <li key={item.title} className='contents'>
            <ShortcutCard item={item} />
          </li>
        ))}
      </ul>
    </>
  )
}
