import { createFileRoute } from '@tanstack/react-router'
import { ConsentFormsScreen } from '~/screens/ConsentFormsScreen'

export const Route = createFileRoute('/_app/consent-forms')({ component: ConsentFormsScreen })
