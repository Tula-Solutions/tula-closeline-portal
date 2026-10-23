import {
  CONSENT_REQUIRED_CHANNELS,
  type ConsentChannel,
  type ConsentSource,
  type ConsentState,
  type SuppressionAddressKind,
  type SuppressionReason,
} from 'tula-closeline-contract'

/** The plain name of each channel. */
export const CHANNEL_NAME: Record<ConsentChannel, string> = {
  phone: 'Phone',
  sms: 'Text message',
  whatsapp: 'WhatsApp',
  email: 'Email',
  linkedin: 'LinkedIn',
}

/** The plain word for each state of a channel. */
export const STATE_WORD: Record<ConsentState, string> = {
  granted: 'Granted',
  withdrawn: 'Withdrawn',
  none: 'No consent yet',
}

/** How a grant or a withdrawal came to be recorded, in a few words. */
export const SOURCE_WORD: Record<ConsentSource, string> = {
  hosted_form: 'Hosted form',
  verbal_call: 'Said on a call',
  import_attestation: 'Attested in an import',
  crm: 'Recorded in a CRM',
  manual: 'Entered by hand',
  unsubscribe: 'Unsubscribed',
  stop_reply: 'Replied STOP',
}

/** Why an address is on Suppression, in a few words. */
export const REASON_WORD: Record<SuppressionReason, string> = {
  unsubscribe: 'Unsubscribed',
  stop: 'Replied STOP',
  bounce: 'Bounced',
  complaint: 'Complained',
  manual: 'Added by hand',
  crm: 'From a CRM',
  erased: 'Erased',
}

/** The plain name of each kind of address. */
export const ADDRESS_KIND_WORD: Record<SuppressionAddressKind, string> = {
  email: 'Email address',
  phone: 'Phone number',
  linkedin: 'LinkedIn address',
}

/** Why contact on a channel is denied, or null when nothing in the record denies it. */
export function denial(
  channel: ConsentChannel,
  state: ConsentState,
  suppressed: boolean
): string | null {
  if (suppressed) {
    return 'Contact denied: the Prospect is suppressed.'
  }
  if (state === 'withdrawn') {
    return 'Contact denied: consent was withdrawn.'
  }
  if (state === 'none' && CONSENT_REQUIRED_CHANNELS.some((required) => required === channel)) {
    return 'Contact denied: no Contact Consent is recorded.'
  }
  return null
}
