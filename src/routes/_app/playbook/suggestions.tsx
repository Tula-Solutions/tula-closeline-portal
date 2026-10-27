import { createFileRoute } from '@tanstack/react-router'
import { SuggestionsScreen } from '~/screens/SuggestionsScreen'

export const Route = createFileRoute('/_app/playbook/suggestions')({ component: SuggestionsScreen })
