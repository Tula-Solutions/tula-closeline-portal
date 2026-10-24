import { createFileRoute } from '@tanstack/react-router'
import { ExportScreen } from '~/screens/audit/ExportScreen'

export const Route = createFileRoute('/_app/export')({ component: ExportScreen })
