/**
 * The words of the hosted consent page. Every claim here is backed by ADR 0003 and nothing else:
 * an Agent calls or texts only with a consent for that channel, every Agent call opens by saying
 * it is an AI and that the call is recorded, and email follows the unsubscribe rules.
 */
export const CONSENT_FORM_PAGE = {
  meta: {
    title: 'Your choices | Closeline',
    description: 'Choose how a sender may reach you.',
    image: '/brand/share.png',
  },
  label: 'Your choices',
  loading: 'Checking your link.',
  // Follows the Organization's name, which the page sets as text.
  introTail: 'asks whether it may call, text or email you. You choose, channel by channel.',
  explainer: {
    heading: 'What a call or text from an AI means',
    points: [
      'An AI Agent may call or text you on phone, SMS or WhatsApp only on a channel you agree to below.',
      'Every call it makes starts by saying that the caller is an AI and that the call is recorded.',
      'Email follows the unsubscribe rules.',
    ],
  },
  wordingHeading: 'What you are agreeing to',
  channelsHeading: 'Channels',
  channelsHint: 'Nothing is ticked. Tick only the channels you agree to.',
  contact: {
    heading: 'How to reach you',
    phone: 'Phone number',
    phoneHint: 'Needed for phone, SMS and WhatsApp.',
    email: 'Email address',
    emailHint: 'Needed for email.',
    firstName: 'First name (optional)',
    lastName: 'Last name (optional)',
  },
  errorLabel: 'Error:',
  errors: {
    choices: 'Tick at least one channel to agree, or close this page to agree to none.',
    phone: 'Enter the phone number to use, for example +14155550123.',
    email: 'Enter the email address to use.',
    name: 'Keep the name to 100 characters.',
    generic: 'Check this answer and try again.',
  },
  button: 'Save my choices',
  working: 'Saving',
  done: {
    heading: 'Your choices are saved',
    // Follows the Organization's name.
    textTail: 'may call or text you only on the phone, SMS or WhatsApp channels you agreed to.',
    at: 'Recorded',
    homeLink: 'Go to the Closeline site',
  },
  invalid: {
    heading: 'This link does not work',
    text: 'It may be out of date, or the form may be closed. Ask the sender for a new link.',
  },
  unreachable:
    'We could not reach the service. Nothing was saved. Check your connection and try again.',
  retry: 'Try again',
} as const
