/** Whether a part of the product is open to every Organization, or in early access by request. */
export type Availability =
  | { readonly kind: 'available'; readonly label: string }
  | { readonly kind: 'early'; readonly label: string }

/** The label of a part that is open to every Organization. */
export const AVAILABLE_LABEL = 'Available now'

/** The label of a part that is offered by request, and the call to action that goes with it. */
export const EARLY_ACCESS = { label: 'Early access', cta: 'Request early access' } as const

/** A labelled value pair in a typeset specimen. */
export interface SpecimenRow {
  readonly term: string
  readonly value: string
}

/** The home page words, in the order they are read. */
export const HOME_COPY = {
  masthead: 'A sales platform',
  hero: {
    // The pieces of the headline: the `em` part is set in italic.
    before: 'Sales, held in ',
    emphasis: 'balance',
    after: ' between a Rep and an AI.',
    lede: 'A Copilot advises your Rep live. An Inbound Agent and an Outbound Agent sell on their own. All of them work from a Playbook learned from your Organization’s won Deals.',
    statusLabel: 'Open now',
    status:
      'The Playbook is open to every Organization. The Copilot, the Inbound Agent and the Outbound Agent are in early access: ask for a place and the Tula team will write back.',
    scaleCaption: 'The Tula scales. The solid pan is the AI. The open pan is the human.',
  },
  fit: {
    numeral: '01',
    label: 'How the parts fit',
    heading: 'One scale, two ways to sell, one body of knowledge.',
    columns: [
      {
        title: 'Copilot',
        text: 'Advises a Rep during a Call. The Rep decides what to say.',
      },
      {
        title: 'Agents',
        text: 'The Inbound Agent and the Outbound Agent sell for the Organization without a Rep taking part.',
      },
    ],
    foundationTitle: 'Playbook',
    foundation:
      'The Documents an Organization uploaded and what its won Deals teach. It sits under the Copilot and under both Agents.',
  },
  copilot: {
    id: 'copilot',
    page: { to: '/copilot', label: 'How the Copilot works' } as const,
    numeral: '02',
    label: 'Copilot',
    availability: { kind: 'early', label: EARLY_ACCESS.label } satisfies Availability,
    heading: 'A second voice for the Rep, in the Call.',
    paragraphs: [
      'During a Call with a Prospect, the Copilot reads the conversation as it happens and suggests what could come next, drawn from your Playbook.',
      'The Rep stays in charge of the conversation. Every Call a Rep takes with the Copilot announces recording and AI assistance.',
    ],
  },
  inbound: {
    id: 'inbound-agent',
    page: { to: '/inbound-agent', label: 'How the Inbound Agent works' } as const,
    numeral: '03',
    label: 'Inbound Agent',
    availability: { kind: 'early', label: EARLY_ACCESS.label } satisfies Availability,
    heading: 'Answers the Prospects who reach out first.',
    paragraphs: [
      'The Inbound Agent responds to a Prospect who gets in touch, finds out whether there is a fit, then books them or hands them to a Rep.',
    ],
  },
  outbound: {
    id: 'outbound-agent',
    page: { to: '/outbound-agent', label: 'How the Outbound Agent works' } as const,
    numeral: '04',
    label: 'Outbound Agent',
    availability: { kind: 'early', label: EARLY_ACCESS.label } satisfies Availability,
    heading: 'Starts the conversation, within the rules.',
    paragraphs: [
      'The Outbound Agent runs campaigns across channels. It places a phone call or sends a text only to a Prospect who has a Contact Consent for that channel.',
    ],
  },
  playbook: {
    id: 'playbook',
    page: { to: '/the-playbook', label: 'How the Playbook works' } as const,
    numeral: '05',
    label: 'Playbook',
    availability: { kind: 'available', label: AVAILABLE_LABEL } satisfies Availability,
    heading: 'Learned from your own won Deals.',
    paragraphs: [
      'Upload Documents such as sales decks and product guides. Import your past Calls and Deals with their Outcomes. Then search for Moments from earlier Calls that resemble the one in front of you, each kept with the Outcome of its Deal.',
    ],
    built: {
      label: 'What you can use now',
      items: ['Documents', 'Calls and Transcripts', 'Deal Outcomes', 'Moment search'],
    },
    specimen: {
      title: 'A Playbook citation',
      rows: [
        { term: 'Moment', value: 'Turns 14 to 17 of a Call' },
        { term: 'Deal Outcome', value: 'Won' },
        {
          term: 'Said by the Rep',
          value: 'Before we talk price, which rollout matters more to your team?',
        },
      ] satisfies readonly SpecimenRow[],
    },
  },
  trust: {
    id: 'trust',
    numeral: '06',
    label: 'Trust, by construction',
    heading: 'Two promises that no Organization can switch off.',
    rules: [
      {
        title: 'Contact Consent first',
        text: 'An Agent calls or texts a Prospect only when a Contact Consent exists for that Prospect on that channel. Without one, there is no call and no text.',
      },
      {
        title: 'Every Call says what it is',
        text: 'Every call discloses AI and recording. It opens by stating that the caller is an AI and that the Call is recorded. No setting turns this off.',
      },
    ],
    status: 'Neither promise has a setting, for any Organization.',
    specimen: {
      title: 'A Contact Consent record',
      rows: [
        { term: 'Prospect', value: 'Example Prospect' },
        { term: 'Channel', value: 'Phone' },
        { term: 'Source', value: 'A web form' },
        {
          term: 'Wording shown',
          value: 'I agree that Example Organization’s AI may call me about my request.',
        },
        { term: 'Kept with', value: 'The time it was given' },
      ] satisfies readonly SpecimenRow[],
    },
  },
  specimenCaption: 'Illustration, invented for this page',
  start: {
    heading: 'Start with the Playbook.',
    text: 'Create an Organization, invite your Reps and upload your first Documents. Ask for early access to the Copilot and the Agents when you are ready for them.',
  },
} as const
