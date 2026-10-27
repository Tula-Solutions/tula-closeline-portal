import { createFileRoute } from '@tanstack/react-router'
import { RoutingRulesScreen } from '~/screens/routing/RoutingRulesScreen'

export const Route = createFileRoute('/_app/routing')({ component: RoutingRulesScreen })
