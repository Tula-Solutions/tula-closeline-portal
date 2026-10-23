import type { SpecimenSection } from '~/marketing/copy/products'

/** Whether a rule is kept by a mechanism that exists today, or is only decided. */
export type RuleStatus =
  | { readonly kind: 'enforced'; readonly line: string }
  | { readonly kind: 'planned'; readonly line: string }

/** One rule of the page: what it says, how it is kept, and the decision record behind it. */
export interface SecurityRule {
  readonly id: string
  readonly title: string
  readonly text: string
  /** Always "Enforced by: <mechanism>" or "Planned, phase N", in plain text. */
  readonly status: RuleStatus
  readonly adr: string
}

/** The words of the security and trust page, in the order they are read. */
export const SECURITY_PAGE = {
  path: '/security',
  meta: {
    title: 'Security and trust: each rule and how it is kept | Closeline',
    description:
      'Each rule Closeline holds itself to, numbered, with the mechanism that enforces it today or the phase in which it is planned, and the decision record behind it.',
    image: '/brand/share.png',
  },
  label: 'Security and trust',
  headline: {
    before: 'Each rule, and how it is ',
    emphasis: 'kept',
    after: '.',
  },
  lede: 'A promise and a mechanism are different things. Every rule below says which it is: either the mechanism that enforces it today, or the phase in which it is planned. A rule that is planned is not working yet, and nothing on this page shows it as working.',
  noCertification:
    'Closeline holds no security certification and no audit report, and claims none. The rules below are decisions we have recorded; each says whether a mechanism enforces it yet.',
  rules: {
    numeral: '01',
    label: 'The rules',
    heading: 'Seven rules, and how each is kept.',
    listLabel: 'The rules',
    referenceLabel: 'Decision record',
    items: [
      {
        id: 'contact-consent',
        title: 'Contact Consent before an Agent reaches out',
        text: 'An Agent may call or text a Prospect only when a Contact Consent exists for that Prospect on that channel. Without one, the system refuses. No Organization can switch this off, and a Rep’s own call is not covered by it.',
        status: {
          kind: 'planned',
          line: 'Planned, phase 2. The check that refuses the call or text, the Contact Check, is proposed and not built. Until it exists, no Agent exists to be refused.',
        },
        adr: 'ADR 0003, ADR 0021',
      },
      {
        id: 'disclosure',
        title: 'AI and recording disclosed on every Call',
        text: 'Every Call an Agent handles opens by stating that the caller is an AI and that the Call is recorded. Every Call a Rep takes with the Copilot announces recording and AI assistance. There is no setting for either.',
        status: {
          kind: 'planned',
          line: 'Planned, phase 2 for Calls with the Copilot, phase 3 for the Inbound Agent and phase 4 for the Outbound Agent. No Call is placed today.',
        },
        adr: 'ADR 0003',
      },
      {
        id: 'isolation',
        title: 'One Organization cannot read another’s data',
        text: 'Every table that holds an Organization’s data is limited to that Organization by the database itself, and a missing or empty Organization means no rows at all, never every row.',
        status: {
          kind: 'enforced',
          line: 'Enforced by: row-level security in Postgres, forced even for the table owner and failing closed. A database test with two Organizations proves the second reads, changes and deletes nothing of the first, and a check of the database catalog lists any table of Organization data that lacks it.',
        },
        adr: 'ADR 0007, ADR 0011',
      },
      {
        id: 'token',
        title: 'Every request belongs to the Organization in the token',
        text: 'A request is scoped to the Organization named in the caller’s verified token. The service never takes the Organization from the address or the body of a request.',
        status: {
          kind: 'enforced',
          line: 'Enforced by: token verification in the shared service library, which sets the Organization, role and Region from the verified claims, so every service reads the same verified values.',
        },
        adr: 'ADR 0005',
      },
      {
        id: 'region',
        title: 'An Organization’s data stays in its Region',
        text: 'An Organization is created in one Region and its data never leaves it. Each Region is a full, separate deployment with its own database, queues, services and sign-in service.',
        status: {
          kind: 'planned',
          line: 'Planned, phase 1. The services already take a Region setting, and the sign-in service stamps the Region into every token. No deployment exists yet; the first environment, in one Region, is a phase 1 step.',
        },
        adr: 'ADR 0001',
      },
      {
        id: 'secrets',
        title: 'No secrets in logs',
        text: 'Passwords, tokens, recordings and message bodies are never written to a log or sent to the error tracker.',
        status: {
          kind: 'enforced',
          line: 'Enforced by: the shared logger, which redacts sensitive fields at any depth before a line is written, with tests that fail if a secret appears. The portal reports only unexpected errors, never a token or an email address.',
        },
        adr: 'ADR 0019, ADR 0018',
      },
      {
        id: 'deletion',
        title: 'Deletion on request',
        text: 'An Admin can erase a Prospect on request. The Prospect and its fields are removed, and only a hashed entry in the Suppression list remains, so the address is not contacted again.',
        status: {
          kind: 'planned',
          line: 'Planned, phase 2. Erasure of a Prospect is not built, and the retention periods are proposed and not yet confirmed.',
        },
        adr: 'ADR 0021',
      },
    ] satisfies readonly SecurityRule[],
  },
  specimen: {
    numeral: '02',
    label: 'What a refusal will look like',
    heading: 'A refusal is a normal answer, and it fails closed.',
    intro:
      'When the Contact Check exists, a channel asks it before every call, text or message. An unknown Prospect, an error or a timeout counts as a refusal. This is planned and does not run today.',
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
    heading: 'Only some of this is built.',
    text: 'The Playbook is the only part built today, and the rules marked Enforced are the ones that already protect your Organization’s data in it.',
  },
} as const
