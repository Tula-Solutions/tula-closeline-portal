import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { Alert, AlertDescription } from '~/components/ui/alert'

const ICON = { error: CircleAlert, info: Info, success: CircleCheck, warning: TriangleAlert }
const VARIANT = { error: 'danger', info: 'info', success: 'success', warning: 'warning' } as const

/** A message for the whole form: an alert for a failure, a status for good news. Focusable so it can be read at once. */
export function Banner(props: {
  readonly kind: 'error' | 'info' | 'success' | 'warning'
  readonly children: ReactNode
  readonly innerRef?: Ref<HTMLDivElement>
  readonly className?: string
}) {
  const Icon = ICON[props.kind]
  return (
    <Alert
      variant={VARIANT[props.kind]}
      className={props.className ?? 'mb-4'}
      role={props.kind === 'error' ? 'alert' : 'status'}
      tabIndex={-1}
      ref={props.innerRef}
    >
      <Icon aria-hidden='true' />
      <AlertDescription>
        {props.kind === 'error' ? <strong>Error: </strong> : null}
        {props.children}
      </AlertDescription>
    </Alert>
  )
}
