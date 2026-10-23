/** The words around every marketing page: header, footer, skip link. Glossary words only. */
export const SITE_COPY = {
  name: 'Closeline',
  skipToContent: 'Skip to content',
  logoAlt: 'Tula Solution',
  navLabel: 'Main',
  /**
   * The four product pages, Security and Book a demo. Pricing is left out until its page exists, so no
   * link goes to a page that is not there.
   */
  nav: [
    { label: 'Copilot', to: '/copilot' },
    { label: 'Inbound Agent', to: '/inbound-agent' },
    { label: 'Outbound Agent', to: '/outbound-agent' },
    { label: 'Playbook', to: '/the-playbook' },
    { label: 'Security', to: '/security' },
    { label: 'Book a demo', to: '/book-a-demo' },
  ],
  signIn: 'Sign in',
  signUp: 'Sign up',
  footer: {
    regionLabel: 'Region',
    regionNote: 'An Organization is created in one Region. Its data stays inside that Region.',
    legalLabel: 'Legal',
    /** `null` until the lawyer's text is published: the label then says so in plain words. */
    legal: [
      { label: 'Privacy notice', href: null },
      { label: 'Terms', href: null },
    ],
    notPublished: 'not yet published',
  },
} as const

/** The title, description and share image of a page, set by `usePageMeta`. */
export const HOME_META = {
  title: 'Closeline: sales held in balance between a Rep and an AI',
  description:
    'Closeline is a sales platform. A Copilot advises a Rep live, Agents sell on their own, and a Playbook learned from your won Deals sits under both.',
  image: '/brand/share.png',
} as const
