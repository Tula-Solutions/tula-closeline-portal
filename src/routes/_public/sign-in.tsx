import { createFileRoute } from '@tanstack/react-router'
import { SignInScreen } from '~/screens/SignInScreen'

export const Route = createFileRoute('/_public/sign-in')({ component: SignInScreen })
