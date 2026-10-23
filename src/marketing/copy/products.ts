import {
  AVAILABLE_LABEL,
  type Availability,
  EARLY_ACCESS,
  type SpecimenRow,
} from '~/marketing/copy/home'

/** The caption under every specimen, as on the home page. */
export const SPECIMEN_CAPTION = 'Illustration, invented for this page'

/** One block of a specimen: labelled values, a typeset exchange, or running text. */
export type SpecimenSection =
  | { readonly kind: 'rows'; readonly label?: string; readonly rows: readonly SpecimenRow[] }
  | {
      readonly kind: 'turns'
      readonly label?: string
      readonly turns: readonly { readonly speaker: string; readonly text: string }[]
    }
  | { readonly kind: 'prose'; readonly label?: string; readonly paragraphs: readonly string[] }

/** The words of one product page, in the order they are read. */
export interface ProductPageCopy {
  readonly path: '/copilot' | '/inbound-agent' | '/outbound-agent' | '/the-playbook'
  readonly meta: { readonly title: string; readonly description: string; readonly image: string }
  readonly label: string
  readonly availability: Availability
  readonly headline: {
    readonly before: string
    readonly emphasis: string
    readonly after: string
  }
  readonly lede: string
  /** The plain statement of what a buyer can do now, in the same words as the ledger. */
  readonly today: string
  readonly how: {
    readonly heading: string
    readonly steps: readonly { readonly title: string; readonly text: string }[]
  }
  readonly specimen: {
    readonly heading: string
    readonly intro: string
    readonly title: string
    readonly sections: readonly SpecimenSection[]
  }
  readonly ledger: {
    readonly heading: string
    /** What is open to every Organization now. */
    readonly available: readonly string[]
    /** What is offered by request, in early access. */
    readonly early: readonly string[]
  }
}

const IMAGE = '/brand/share.png'

/** Words shared by the four product pages. */
export const PRODUCT_COMMON = {
  how: { numeral: '01', label: 'How it works' },
  specimen: { numeral: '02', label: 'In practice' },
  ledger: { numeral: '03', label: 'What you can use' },
  todayLabel: 'Open now',
  availableLabel: AVAILABLE_LABEL,
  earlyLabel: EARLY_ACCESS.label,
  availableNone: 'Nothing yet.',
  closing: {
    heading: 'Start with the Playbook.',
    text: 'Create an Organization, invite your Reps and upload your first Documents. The Playbook is open to every Organization, and early access to the rest is by request.',
    link: 'Read about the Playbook',
  },
} as const

const COPILOT: ProductPageCopy = {
  path: '/copilot',
  meta: {
    title: 'Copilot: evidence for the Rep during a Call | Closeline',
    description:
      'The Copilot is in early access. During a Call it will search your Playbook for similar Moments from won Deals and show the Rep what was said next.',
    image: IMAGE,
  },
  label: 'Copilot',
  availability: { kind: 'early', label: EARLY_ACCESS.label },
  headline: {
    before: 'The Rep decides. The Copilot brings the ',
    emphasis: 'evidence',
    after: '.',
  },
  lede: 'A Rep on a Call has to remember what has worked. The Copilot listens to the Call, looks in the Playbook for similar Moments from your won Deals, and puts what the Organization said next in front of the Rep.',
  today:
    'The Copilot is in early access. Request a place and the Tula team will write back. The Playbook search it draws on is open to every Organization now.',
  how: {
    heading: 'From a Prospect’s sentence to a card.',
    steps: [
      {
        title: 'The Rep turns the Copilot on',
        text: 'Before the Call starts, the Rep chooses whether the Copilot takes part. On a Call with the Copilot, the Prospect hears that the Call is recorded and that AI is assisting.',
      },
      {
        title: 'It listens to both sides',
        text: 'The words of the Call become a Transcript as they are spoken.',
      },
      {
        title: 'It searches the Playbook',
        text: 'After the Prospect speaks, the Copilot looks for similar Moments in the Organization’s won Deals.',
      },
      {
        title: 'The Rep sees a card, or nothing',
        text: 'A card shows what the Rep said next in those Moments and the Outcome of their Deals. Without evidence there is no card. If anything fails, the Call goes on as normal.',
      },
    ],
  },
  specimen: {
    heading: 'A card, as the Rep would see it.',
    intro:
      'The Prospect has just raised price. The card is built only from Moments in the Organization’s own won Deals.',
    title: 'A Moment card, shown during a Call',
    sections: [
      {
        kind: 'rows',
        rows: [
          { term: 'Heard', value: 'Your price is higher than what we pay today.' },
          { term: 'Moment', value: 'An earlier Call, in a Deal that was won' },
          {
            term: 'Said next by the Rep',
            value: 'What would the tool you have now need to do for this to be an easy choice?',
          },
          { term: 'Deal Outcome', value: 'Won' },
          { term: 'Evidence', value: 'Moments from this Organization’s won Deals' },
        ],
      },
    ],
  },
  ledger: {
    heading: 'What is open now, and what is in early access.',
    available: ['Moment search in the Playbook, which the Copilot draws on'],
    early: [
      'A live Transcript beside the Rep’s call controls',
      'Moment cards during a Call',
      'The recording and AI notice at the start of a Call with the Copilot',
      'Turning the Copilot off for one Call',
    ],
  },
}

const INBOUND: ProductPageCopy = {
  path: '/inbound-agent',
  meta: {
    title: 'Inbound Agent: answers Prospects who reach out first | Closeline',
    description:
      'The Inbound Agent is in early access. It will answer a Prospect who gets in touch, ask your qualification questions, then book them or hand them to a Rep.',
    image: IMAGE,
  },
  label: 'Inbound Agent',
  availability: { kind: 'early', label: EARLY_ACCESS.label },
  headline: {
    before: 'Answers the Prospect who reaches out, then books or hands over to a ',
    emphasis: 'Rep',
    after: '.',
  },
  lede: 'A Prospect who fills in a form or starts a chat wants an answer now, and a Rep cannot sit by every phone. The Inbound Agent answers from the Organization’s own Documents and won Deals, finds out whether there is a fit, and passes the Prospect on.',
  today:
    'The Inbound Agent is in early access. Request a place and the Tula team will write back. The Playbook it answers from is open to every Organization now.',
  how: {
    heading: 'From a first message to a booking.',
    steps: [
      {
        title: 'A Prospect gets in touch',
        text: 'By a form on your site, a chat on your site or a phone Call. The Prospect is recorded along with the Contact Consent given, and where it came from.',
      },
      {
        title: 'The Call opens with a disclosure',
        text: 'The first thing a Prospect hears on a Call is that the caller is an AI and that the Call is recorded. There is no setting to turn this off.',
      },
      {
        title: 'It asks the Organization’s questions',
        text: 'It asks the qualification questions the Organization wrote, answers the Prospect’s questions from the Playbook, and records what it learned.',
      },
      {
        title: 'It books, or hands over',
        text: 'A Prospect who fits is booked with a Rep. A Prospect who asks for a person is handed to one. A Prospect who says stop has their Contact Consent withdrawn and the Call ends.',
      },
    ],
  },
  specimen: {
    heading: 'An exchange, set as a transcript.',
    intro: 'A short qualification Call, from the opening disclosure to the booking.',
    title: 'A qualification exchange on a Call',
    sections: [
      {
        kind: 'turns',
        turns: [
          {
            speaker: 'Inbound Agent',
            text: 'This is an AI calling for Example Organization, and this Call is recorded. You asked us to call about a demo. Is now a good time?',
          },
          { speaker: 'Prospect', text: 'Yes, go ahead.' },
          {
            speaker: 'Inbound Agent',
            text: 'Which tools does your team use to follow its Deals today?',
          },
          { speaker: 'Prospect', text: 'A spreadsheet, mostly.' },
          {
            speaker: 'Inbound Agent',
            text: 'Thank you. I will book you with a Rep. Does Thursday morning suit you?',
          },
        ],
      },
      {
        kind: 'rows',
        label: 'Recorded afterwards',
        rows: [
          { term: 'Follows Deals in', value: 'A spreadsheet' },
          { term: 'Next step', value: 'Booked with a Rep' },
        ],
      },
    ],
  },
  ledger: {
    heading: 'What is open now, and what is in early access.',
    available: ['The Playbook it answers from: Documents, Calls and Moment search'],
    early: [
      'Answering a form, a chat or a phone Call from a Prospect',
      'The opening disclosure on every Call',
      'The Organization’s qualification questions, with the answers recorded',
      'Booking a Prospect with a Rep, or handing the Call to one',
      'Texts and WhatsApp messages',
    ],
  },
}

const OUTBOUND: ProductPageCopy = {
  path: '/outbound-agent',
  meta: {
    title: 'Outbound Agent: campaigns with cited drafts | Closeline',
    description:
      'The Outbound Agent is in early access. It will run campaigns whose drafts cite the won-Deal Moments behind them and pass a Contact Check before anything is sent.',
    image: IMAGE,
  },
  label: 'Outbound Agent',
  availability: { kind: 'early', label: EARLY_ACCESS.label },
  headline: {
    before: 'Starts the conversation, and shows its ',
    emphasis: 'evidence',
    after: '.',
  },
  lede: 'The Outbound Agent runs campaigns for an Organization. Each draft is written from Moments in your won Deals and passages in your Documents, lists what it used, and must pass a Contact Check before it can be sent.',
  today:
    'The Outbound Agent is in early access. Request a place and the Tula team will write back. The Playbook it writes from is open to every Organization now.',
  how: {
    heading: 'From a Prospect to a cited draft.',
    steps: [
      {
        title: 'A campaign is set up',
        text: 'An Organization chooses its Prospects and writes a sequence of steps: an email, a wait, a branch on a reply, a task for a Rep.',
      },
      {
        title: 'It researches the Prospect',
        text: 'It gathers what is known about the Prospect and the Organization’s Playbook. Each statement in the brief points to its source; a statement with none is dropped.',
      },
      {
        title: 'It writes a draft and cites it',
        text: 'The draft lists the Moments and Documents it used. A draft that cites no won-Deal evidence is marked ungrounded and cannot be sent on its own.',
      },
      {
        title: 'A Contact Check runs first',
        text: 'Before anything is sent, the system checks whether the Prospect may be reached on that channel. An Agent places no phone call and sends no text without a Contact Consent for that channel.',
      },
    ],
  },
  specimen: {
    heading: 'A draft, with its evidence.',
    intro: 'What a Rep or an Admin would see before a message goes out.',
    title: 'A draft message with its citations',
    sections: [
      {
        kind: 'rows',
        rows: [
          { term: 'To', value: 'Example Prospect' },
          { term: 'Channel', value: 'Email' },
          { term: 'Subject', value: 'A question about your rollout' },
        ],
      },
      {
        kind: 'prose',
        label: 'Draft',
        paragraphs: [
          'Hello Example, teams that are weighing a change often ask which rollout matters more before they ask about price. Which would it be for yours?',
        ],
      },
      {
        kind: 'rows',
        label: 'Cited',
        rows: [
          {
            term: 'Moment',
            value: 'A Call in a won Deal, where the Rep asked about rollout before price',
          },
          { term: 'Document', value: 'A passage from a rollout guide the Organization uploaded' },
          { term: 'Grounded', value: 'Yes, it cites a won Deal' },
        ],
      },
      {
        kind: 'rows',
        label: 'Contact Check',
        rows: [
          { term: 'Channel', value: 'Email' },
          { term: 'Answer', value: 'Cleared to send' },
          { term: 'Ran', value: 'Before the draft could be sent' },
        ],
      },
    ],
  },
  ledger: {
    heading: 'What is open now, and what is in early access.',
    available: ['The Playbook it writes from: Documents, Calls and Moment search'],
    early: [
      'Campaigns of email steps, waits, branches on a reply and tasks for a Rep',
      'A research brief for each Prospect, with a source for every statement',
      'Drafts that cite the Moments and Documents behind them',
      'A Contact Check before every send',
      'LinkedIn and further channels',
    ],
  },
}

const PLAYBOOK: ProductPageCopy = {
  path: '/the-playbook',
  meta: {
    title: 'Playbook: learned from your won Deals | Closeline',
    description:
      'The Playbook is open to every Organization. Upload Documents, add Calls with Transcripts and Recordings, import Deals with their Outcomes, and search for similar Moments.',
    image: IMAGE,
  },
  label: 'Playbook',
  availability: { kind: 'available', label: AVAILABLE_LABEL },
  headline: {
    before: 'Your own won Deals, made ',
    emphasis: 'searchable',
    after: '.',
  },
  lede: 'The Playbook is an Organization’s sales knowledge: the Documents it uploaded and what its past Calls and Deals teach. It sits under the Copilot and under both Agents. You can fill it and search it now.',
  today:
    'The Playbook is open to every Organization: sign up and fill it. The Copilot and the Agents that draw on it are in early access.',
  how: {
    heading: 'From your files to an answer.',
    steps: [
      {
        title: 'Upload Documents',
        text: 'Add PDF, Word, PowerPoint, text and Markdown files. Closeline reads them into passages you can search.',
      },
      {
        title: 'Add Calls',
        text: 'Upload a Transcript or a Recording of a Call and say which Deal it belongs to. A Recording is transcribed, with who spoke, and its Rep is picked.',
      },
      {
        title: 'Import Deals with their Outcomes',
        text: 'Import a CSV of Deals, each marked won, lost or open, or set the Outcome of a Deal by hand. Only Owners and Admins can see sales history.',
      },
      {
        title: 'Search for Moments',
        text: 'Describe a situation. The search finds similar Moments in won Deals and shows what the Rep said next, with how many Moments and Deals it found.',
      },
    ],
  },
  specimen: {
    heading: 'A search, and what it returns.',
    intro: 'Every Moment is kept with the Outcome of its Deal.',
    title: 'A Moment search, with its answer',
    sections: [
      {
        kind: 'rows',
        rows: [
          { term: 'Searched for', value: 'The Prospect says the price is too high' },
          { term: 'Prospect said', value: 'We can get something close for much less.' },
          {
            term: 'Rep said next',
            value: 'Which part of the price worries you most: the start, or the total over time?',
          },
          { term: 'Deal Outcome', value: 'Won' },
        ],
      },
    ],
  },
  ledger: {
    heading: 'What is open now, and what is in early access.',
    available: [
      'Documents: upload, reading and search',
      'Calls with Transcripts and Recordings',
      'Deal import with Outcomes',
      'Moment search in won Deals',
    ],
    early: [
      'Drawn on live by the Copilot during a Call',
      'Drawn on by the Inbound Agent to answer a Prospect',
      'Drawn on by the Outbound Agent to write and cite drafts',
    ],
  },
}

/** The four product pages, by path. */
export const PRODUCT_PAGES = {
  copilot: COPILOT,
  inbound: INBOUND,
  outbound: OUTBOUND,
  playbook: PLAYBOOK,
} as const
