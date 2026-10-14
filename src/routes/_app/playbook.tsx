import { createFileRoute } from '@tanstack/react-router'
import { PlaybookLayout } from '~/screens/PlaybookLayout'

export const Route = createFileRoute('/_app/playbook')({ component: PlaybookLayout })
