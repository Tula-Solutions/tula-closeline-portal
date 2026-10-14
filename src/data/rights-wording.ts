/**
 * The wording of the rights confirmation (ADR 0018, choice 12), by version. The contract carries
 * only the version number: the service raises `currentWordingVersion` when the wording changes
 * and the portal must show the matching text, so a version this build has no text for cannot be
 * confirmed from here.
 *
 * PENDING A LAWYER'S CHECK. This wording is a draft. A lawyer is to review it before real
 * customers use it, and a change to the text must come with a new version number here and in the
 * service. Do not edit a published version in place.
 */
export type RightsWording = {
  readonly heading: string
  readonly paragraphs: readonly string[]
  readonly checkbox: string
  /** The text has not been checked by a lawyer yet: the screen says so. Remove it, with a new version, once it has. */
  readonly draft?: true
}

/** The wording the portal can show, keyed by version. */
export const RIGHTS_WORDING: Readonly<Record<number, RightsWording>> = {
  1: {
    draft: true,
    heading: 'Confirm your right to share Calls',
    paragraphs: [
      'Before you upload Transcripts or Recordings of past Calls, Closeline records that your Organization has the right to share them.',
      'The Calls you upload hold the words, and in a Recording the voices, of your Reps and of your Prospects. Closeline stores them for your Organization and uses them to find similar Moments from won Deals. It does not share them with other Organizations.',
    ],
    checkbox:
      'I confirm that I am authorised to act for my Organization, that my Organization has the right to share the Transcripts and Recordings it uploads to Closeline, and that any notice to the people on those Calls and any consent the law requires have been given or obtained. I understand that this confirmation is recorded with my name and the time.',
  },
}

/** The wording for a version, or undefined when this build of the portal does not have it. */
export function rightsWordingFor(version: number): RightsWording | undefined {
  return Object.hasOwn(RIGHTS_WORDING, version) ? RIGHTS_WORDING[version] : undefined
}
