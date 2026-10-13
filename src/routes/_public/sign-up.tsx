import { createFileRoute } from '@tanstack/react-router'
import { SignUpScreen } from '~/screens/SignUpScreen'

export const Route = createFileRoute('/_public/sign-up')({ component: SignUpScreen })
