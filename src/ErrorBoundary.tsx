import { Component, type ReactNode } from 'react'
import { ErrorScreen } from '~/screens/ErrorScreen'

/** Catches a crash anywhere below it and shows the error screen. */
export class ErrorBoundary extends Component<
  { readonly children: ReactNode },
  { readonly error: unknown; readonly failed: boolean }
> {
  override state = { error: undefined as unknown, failed: false }

  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true }
  }

  override render() {
    return this.state.failed ? <ErrorScreen error={this.state.error} /> : this.props.children
  }
}
