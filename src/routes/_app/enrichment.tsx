import { createFileRoute } from '@tanstack/react-router'
import { EnrichmentSettingsScreen } from '~/screens/enrichment/EnrichmentSettingsScreen'

export const Route = createFileRoute('/_app/enrichment')({ component: EnrichmentSettingsScreen })
