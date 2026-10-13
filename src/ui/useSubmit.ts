import { useMutation } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'

/**
 * Runs an async submit at most once at a time: a second submit while one is running is ignored,
 * even when it arrives before React has re-rendered. `pending` drives the button's state.
 */
export function useSubmit<Input>(
  run: (input: Input) => Promise<void>,
  handlers: { readonly onError: (error: unknown) => void }
) {
  const busy = useRef(false)
  const mutation = useMutation({ mutationFn: run })
  const { mutate } = mutation
  const submit = useCallback(
    (input: Input) => {
      if (busy.current) {
        return
      }
      busy.current = true
      mutate(input, {
        onError: handlers.onError,
        onSettled: () => {
          busy.current = false
        },
      })
    },
    [mutate, handlers.onError]
  )
  return { submit, pending: mutation.isPending }
}
