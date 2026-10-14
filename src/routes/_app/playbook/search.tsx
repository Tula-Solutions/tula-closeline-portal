import { createFileRoute } from '@tanstack/react-router'
import { SearchDocumentsScreen } from '~/screens/SearchDocumentsScreen'

export const Route = createFileRoute('/_app/playbook/search')({ component: SearchDocumentsScreen })
