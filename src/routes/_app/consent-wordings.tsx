import { createFileRoute } from '@tanstack/react-router'
import { ConsentWordingScreen } from '~/screens/ConsentWordingScreen'

export const Route = createFileRoute('/_app/consent-wordings')({ component: ConsentWordingScreen })
