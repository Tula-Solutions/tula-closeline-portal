import { createFileRoute } from '@tanstack/react-router'
import { SuppressionScreen } from '~/screens/SuppressionScreen'

export const Route = createFileRoute('/_app/suppression')({ component: SuppressionScreen })
