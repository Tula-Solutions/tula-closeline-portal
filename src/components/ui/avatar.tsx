import { cn } from '~/lib/utils'

const TONES = [
  'bg-[var(--avatar-1)]',
  'bg-[var(--avatar-2)]',
  'bg-[var(--avatar-3)]',
  'bg-[var(--avatar-4)]',
  'bg-[var(--avatar-5)]',
  'bg-[var(--avatar-6)]',
] as const

/**
 * Up to two initials from a name or an email address: the first letter of the first and last words
 * (of the part before `@` for an address). Only letters and digits count, so markup or a direction
 * override in the source never reaches the avatar; with none, a `?` stands in.
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

/** Which of the avatar fills a person gets: the same for the same key, every time. */
export function toneIndex(key: string): number {
  let hash = 0
  for (const char of key) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  }
  return hash % TONES.length
}

/**
 * A round mark with a person's initials. It is decoration (the name is always shown beside it), so
 * it is hidden from assistive technology. `toneKey` (a stable id) picks the fill.
 */
export function Avatar(props: {
  readonly name: string
  readonly toneKey: string
  readonly size?: 'sm' | 'md'
  readonly className?: string
}) {
  return (
    <span
      aria-hidden='true'
      data-slot='avatar'
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight text-avatar-foreground ring-1 ring-foreground/5 select-none',
        props.size === 'sm' ? 'size-7 text-[0.6875rem]' : 'size-8 text-xs',
        TONES[toneIndex(props.toneKey)],
        props.className
      )}
    >
      {initials(props.name)}
    </span>
  )
}
