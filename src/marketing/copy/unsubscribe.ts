/** The words of the unsubscribe page. It names who sent the message and never the address. */
export const UNSUBSCRIBE_PAGE = {
  meta: {
    title: 'Unsubscribe | Closeline',
    description: 'Stop the emails from a sender that uses Closeline.',
    image: '/brand/share.png',
  },
  label: 'Unsubscribe',
  loading: 'Checking your link.',
  confirm: {
    heading: 'Stop these emails?',
    // `{sender}` is the Organization that sent the message.
    text: (sender: string) =>
      `You will no longer get emails from ${sender}. Nothing else changes, and you do not need an account.`,
    button: 'Unsubscribe',
    working: 'Unsubscribing',
  },
  done: {
    heading: 'You are unsubscribed',
    text: (sender: string) =>
      `${sender} will not email you again. If you open this link again, nothing changes.`,
    homeLink: 'Go to the Closeline site',
  },
  invalid: {
    heading: 'This link does not work',
    text: 'It may be out of date, or it may have been changed. If you still get emails you do not want, reply to the sender and ask to be removed, or use the unsubscribe link in a newer message.',
  },
  rateLimited: 'Too many requests just now. Wait a minute and try again.',
  unreachable: 'We could not reach the service. Check your connection and try again.',
  retry: 'Try again',
} as const
