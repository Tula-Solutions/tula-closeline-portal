import { createFileRoute } from '@tanstack/react-router'
import { SecurityPage } from '~/marketing/SecurityPage'

export const Route = createFileRoute('/_site/security')({ component: SecurityPage })
