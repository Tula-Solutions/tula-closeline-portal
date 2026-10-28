import {
  type CountryCode,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from 'libphonenumber-js/min'
import type { SelectOption } from '~/components/ui/select'

/** The country the dial pad starts on. */
export const DEFAULT_COUNTRY: CountryCode = 'US'

const names = new Intl.DisplayNames(['en'], { type: 'region' })

/** The flag emoji of an ISO 3166 country code (two regional indicator letters). */
export function flagOf(iso: string): string {
  return String.fromCodePoint(...[...iso].map((letter) => 0x1f1a5 + letter.charCodeAt(0)))
}

/** Every country as a select option: flag, name and dialling code, sorted by name. */
export const COUNTRY_OPTIONS: readonly SelectOption[] = getCountries()
  .map((iso) => ({ iso, name: names.of(iso) ?? iso }))
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(({ iso, name }) => ({
    value: iso,
    text: `${flagOf(iso)} ${name} +${getCountryCallingCode(iso)}`,
  }))

/** The E.164 string for a national number in a country: `+` , the calling code and the digits; empty when no digits. */
export function buildE164(iso: CountryCode, national: string): string {
  const digits = national.replace(/\D/g, '')
  if (digits === '') {
    return ''
  }
  // Parsing for the country drops a trunk zero (UK 020…); an unparsable number is sent as typed and the server judges it.
  return (
    parsePhoneNumberFromString(digits, iso)?.number ?? `+${getCountryCallingCode(iso)}${digits}`
  )
}

/**
 * Splits a number typed or pasted with a leading `+` into its country and national number. The
 * current country is kept when it shares the calling code (+1 is also Canada); null when there is
 * no `+` or no known calling code yet.
 */
export function splitInternational(
  value: string,
  current: CountryCode
): { readonly iso: CountryCode; readonly national: string } | null {
  const text = value.trim()
  if (!text.startsWith('+')) {
    return null
  }
  const digits = text.replace(/\D/g, '')
  const countries = getCountries()
  for (let length = 1; length <= 3; length += 1) {
    const code = digits.slice(0, length)
    if (getCountryCallingCode(current) === code) {
      return { iso: current, national: digits.slice(length) }
    }
    const parsed = parsePhoneNumberFromString(`+${digits}`)
    const iso =
      parsed?.country !== undefined && parsed.countryCallingCode === code
        ? parsed.country
        : countries.find((country) => getCountryCallingCode(country) === code)
    if (iso !== undefined) {
      return { iso, national: digits.slice(length) }
    }
  }
  return null
}
