import { createFileRoute } from '@tanstack/react-router'
import { AssessmentsScreen } from '~/screens/assessments/AssessmentsScreen'
import { readAssessmentSearch } from '~/screens/assessments/search'

export const Route = createFileRoute('/_app/assessments')({
  // Only valid values stay in the address; anything else is dropped.
  validateSearch: readAssessmentSearch,
  component: AssessmentsScreen,
})
