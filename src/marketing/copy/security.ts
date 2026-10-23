import type { SpecimenSection } from '~/marketing/copy/products'

/** Whether a rule is kept by a mechanism that runs now, or is a promise made for what is in early access. */
export type RuleStatus =
  | { readonly kind: 'enforced'; readonly line: string }
  | { readonly kind: 'promise'; readonly line: string }

/** One rule of the page: what it says and how it is kept. */
export interface SecurityRule {
  readonly id: string
  readonly title: string
  readonly text: string
  /** Always "Enforced by: <mechanism>" or "Our promise: <what we hold to>", in plain text. */
  readonly status: RuleStatus
}

/** The words of the security and trust page, in the order they are read. */
export const SECURITY_PAGE = {
  path: '/security',
  meta: {
    title: 'Security and trust: each rule and how it is kept | Closeline',
    description:
      'Each rule Closeline holds itself to, numbered, with the mechanism that enforces it or the promise we make for what is in early access.',
    image: '/brand/share.png',
  },
  label: 'Security and trust',
  headline: {
    before: 'Each rule, and how it is ',
    emphasis: 'kept',
    after: '.',
  },
  lede: 'A promise and a mechanism are different things. Every rule below says which it is: either the mechanism that enforces it, or the promise we make for the parts still in early access. A promise is not a mechanism, and nothing on this page shows it as one.',
  noCertification:
    'Closeline holds no security certification and no audit report, and claims none. The rules below are our commitments; each says whether a mechanism enforces it yet.',
  rules: {
    numeral: '01',
    label: 'The rules',
    heading: 'Seven rules, and how each is kept.',
    listLabel: 'The rules',
    items: [
      {
        id: 'contact-consent',
        title: 'Contact Consent before an Agent reaches out',
        text: 'An Agent calls or texts a Prospect only when a Contact Consent exists for that Prospect on that channel. Without one, the system refuses. No Organization can switch this off, and a Rep’s own call is not covered by it.',
        status: {
          kind: 'promise',
          line: 'Our promise: no Agent reaches a Prospect on a channel without a Contact Consent for it. The check that refuses a call or text, the Contact Check, comes with the Agents in early access.',
        },
      },
      {
        id: 'disclosure',
        title: 'AI and recording disclosed on every Call',
        text: 'Every Call an Agent handles opens by stating that the caller is an AI and that the Call is recorded. Every Call a Rep takes with the Copilot announces recording and AI assistance.',
        status: {
          kind: 'promise',
          line: 'Our promise: every call discloses AI and recording. No setting turns this off, for the Copilot or for either Agent.',
        },
      },
      {
        id: 'isolation',
        title: 'One Organization cannot read another’s data',
        text: 'Every table that holds an Organization’s data is limited to that Organization by the database itself, and a missing or empty Organization means no rows at all, never every row.',
        status: {
          kind: 'enforced',
          line: 'Enforced by: row-level security in Postgres, forced even for the table owner and failing closed. A database test with two Organizations proves the second reads, changes and deletes nothing of the first, and a check of the database catalog lists any table of Organization data that lacks it.',
        },
      },
      {
        id: 'token',
        title: 'Every request belongs to the Organization in the token',
        text: 'A request is scoped to the Organization named in the caller’s verified token. The service never takes the Organization from the address or the body of a request.',
        status: {
          kind: 'enforced',
          line: 'Enforced by: token verification in the shared service library, which sets the Organization, role and Region from the verified claims, so every service reads the same verified values.',
        },
      },
      {
        id: 'region',
        title: 'An Organization’s data stays in its Region',
        text: 'An Organization is created in one Region and its data never leaves it. Each Region is a full, separate deployment with its own database, queues, services and sign-in service.',
        status: {
          kind: 'promise',
          line: 'Our promise: an Organization’s data stays in the Region it was created in. The sign-in service stamps the Region into every token, and each service takes it as a setting.',
        },
      },
      {
        id: 'secrets',
        title: 'No secrets in logs',
        text: 'Passwords, tokens, recordings and message bodies are never written to a log or sent to the error tracker.',
        status: {
          kind: 'enforced',
          line: 'Enforced by: the shared logger, which redacts sensitive fields at any depth before a line is written, with tests that fail if a secret appears. The portal reports only unexpected errors, never a token or an email address.',
        },
      },
      {
        id: 'deletion',
        title: 'Deletion on request',
        text: 'An Admin can erase a Prospect on request. The Prospect and its fields are removed, and only a hashed entry in the Suppression list remains, so the address is not contacted again.',
        status: {
          kind: 'promise',
          line: 'Our promise: when an Admin asks, the Prospect is erased. Erasure comes with the Agents in early access, and the retention periods are still being confirmed.',
        },
      },
    ] satisfies readonly SecurityRule[],
  },
  specimen: {
    numeral: '02',
    label: 'What a refusal looks like',
    heading: 'A refusal is a normal answer, and it fails closed.',
    intro:
      'The Contact Check is part of early access. A channel asks it before every call, text or message. An unknown Prospect, an error or a timeout counts as a refusal.',
    title: 'A Contact Check answer',
    sections: [
      {
        kind: 'rows',
        rows: [
          { term: 'Prospect', value: 'Example Prospect' },
          { term: 'Channel', value: 'SMS' },
          { term: 'Purpose', value: 'Agent-initiated' },
          { term: 'Answer', value: 'Denied: no Contact Consent on this channel' },
          { term: 'Code', value: 'consent.missing' },
        ],
      },
    ] satisfies readonly SpecimenSection[],
  },
  closing: {
    heading: 'Start with what is open now.',
    text: 'The Playbook is open to every Organization, and the rules marked Enforced are the ones that already protect your Organization’s data in it. Early access to the Copilot and the Agents is by request.',
  },
} as const
