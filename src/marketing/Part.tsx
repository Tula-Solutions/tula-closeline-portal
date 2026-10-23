import type { ReactNode } from 'react'
import type { Availability } from '~/marketing/copy/home'

/**
 * One numbered part of a page, set like a broadsheet column pair: a narrow left column with the
 * mono numeral and label (and whether the part is built), a vertical hairline, then the text. It
 * opens with a heavy rule, never an icon.
 */
export function Part(props: {
  readonly id?: string
  readonly numeral: string
  readonly label: string
  readonly availability?: Availability
  readonly heading: string
  readonly children: ReactNode
}) {
  const headingId = `${props.id ?? props.numeral}-heading`
  return (
    <section
      id={props.id}
      aria-labelledby={headingId}
      className='scroll-mt-4 border-t border-rule-strong md:grid md:grid-cols-12'
    >
      <div className='pt-5 pb-2 md:col-span-3 md:pr-6 md:pb-8'>
        <p className='label-mono m-0 text-foreground'>{`${props.numeral} / ${props.label}`}</p>
        {props.availability === undefined ? null : (
          <p className='label-mono m-0 mt-1'>{props.availability.label}</p>
        )}
      </div>
      <div className='pt-2 pb-10 md:col-span-9 md:border-l md:border-border-strong md:pt-5 md:pb-14 md:pl-8'>
        <h2
          id={headingId}
          className='m-0 mb-6 max-w-[22ch] font-serif text-[clamp(2rem,4.6vw,3.75rem)] leading-[1] font-normal tracking-[-0.03em] text-balance'
        >
          {props.heading}
        </h2>
        {props.children}
      </div>
    </section>
  )
}
