import { cn } from '~/lib/utils'

/**
 * Up to two initials from a name or an email address: the first letter of the first and last words
 * (of the part before `@` for an address). Only letters and digits count, so markup or a direction
 * override in the source never reaches the monogram; with none, a `?` stands in.
 */
export function initials(source: string): string {
  const local = source.includes('@') ? (source.split('@')[0] ?? '') : source
  const words = local
    .split(/[\s._-]+/u)
    .map((word) => Array.from(word).filter((char) => /[\p{L}\p{N}]/u.test(char)))
    .filter((chars) => chars.length > 0)
  const first = words[0]?.[0]
  const last = words.length > 1 ? words[words.length - 1]?.[0] : undefined
  if (first === undefined) {
    return '?'
  }
  return `${first}${last ?? ''}`.toLocaleUpperCase()
}

/**
 * A person's initials set in the serif, like a monogram in a ledger's margin: no fill, no circle.
 * It is decoration (the name is always shown beside it), so it is hidden from assistive technology.
 */
export function Monogram(props: { readonly name: string; readonly className?: string }) {
  return (
    <span
      aria-hidden='true'
      data-slot='monogram'
      className={cn(
        'inline-block w-9 shrink-0 font-serif text-lg leading-none tracking-[0.02em] text-muted-foreground italic select-none',
        props.className
      )}
    >
      {initials(props.name)}
    </span>
  )
}
