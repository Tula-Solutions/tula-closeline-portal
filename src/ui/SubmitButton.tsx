import { Loader2 } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Button } from '~/components/ui/button'

/**
 * A form's submit button. While the request runs it shows a spinner and is marked disabled for
 * assistive technology (not `disabled`, so it keeps focus); the caller also swaps its label.
 */
export function SubmitButton({
  pending,
  children,
  ...props
}: { readonly pending: boolean } & Omit<ComponentProps<typeof Button>, 'type' | 'aria-disabled'>) {
  return (
    <Button type='submit' aria-disabled={pending} {...props}>
      {pending ? <Loader2 aria-hidden='true' className='animate-spin' /> : null}
      {children}
    </Button>
  )
}
