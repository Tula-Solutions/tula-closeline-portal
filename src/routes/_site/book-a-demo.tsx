import { createFileRoute } from '@tanstack/react-router'
import { DemoPage } from '~/marketing/DemoPage'

export const Route = createFileRoute('/_site/book-a-demo')({ component: DemoPage })
