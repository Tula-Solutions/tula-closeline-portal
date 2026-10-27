import { createFileRoute } from '@tanstack/react-router'
import { ApiKeysScreen } from '~/screens/ApiKeysScreen'

export const Route = createFileRoute('/_app/api-keys')({ component: ApiKeysScreen })
