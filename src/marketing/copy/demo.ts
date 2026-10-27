/** The words of the book-a-demo page. It promises no reply time; do not add one. */
export const DEMO_PAGE = {
  path: '/book-a-demo',
  navLabel: 'Book a demo',
  meta: {
    title: 'Book a demo | Closeline',
    description:
      'Ask to see Closeline. Tell us who you are and what you sell, and the Tula team will follow up by email.',
    image: '/brand/share.png',
  },
  label: 'Book a demo',
  headline: {
    before: 'See Closeline ',
    emphasis: 'working',
    after: '',
  },
  lede: 'Tell us who you are and what your Reps sell. The Tula team reads every request and writes back by email.',
  formLabel: 'Book a demo',
  required: 'Required',
  optional: 'optional',
  fields: {
    name: {
      label: 'Your name',
      error: 'Enter your name, without control characters.',
    },
    workEmail: {
      label: 'Work email',
      hint: 'We write back to this address.',
      error: 'Enter a valid email address.',
    },
    companyName: {
      label: 'Organization name',
      error: 'Enter the name of your Organization, up to 200 characters.',
    },
    message: {
      label: 'What would you like to see',
      hint: 'A few words on your sales process, your Reps or the Playbook you have in mind. Up to 2,000 characters.',
      error: 'Shorten the message to 2,000 characters or fewer.',
    },
    honeypot: { label: 'Leave this field empty' },
  },
  submit: 'Send request',
  sending: 'Sending',
  errors: {
    invalid: 'The request could not be accepted. Check what you entered and send it again.',
    rateLimited: 'Too many requests came from your connection. Wait a little, then send it again.',
    unreachable: 'The request did not go through. What you entered is kept. Send it again.',
    keyReused: 'That request was changed while it was being sent. Send it again.',
    inProgress: 'The request is still being sent. Wait a moment, then send it again.',
  },
  confirmation: {
    heading: 'Request received',
    text: 'Thank you. The Tula team will write to the work email you gave.',
    homeLink: 'Back to the home page',
  },
  privacy: 'We use what you enter here only to answer this request.',
} as const
