import type { SpecimenRow } from '~/marketing/copy/home'
import { HOME_COPY } from '~/marketing/copy/home'

/**
 * A typeset specimen of a record the product keeps: a hairline border, no shadow, set in the
 * page's own type, and always captioned as invented, so it is never read as a real customer record.
 */
export function Specimen(props: { readonly title: string; readonly rows: readonly SpecimenRow[] }) {
  return (
    <figure className='m-0 border border-current/50 p-5'>
      <p className='label-mono m-0 border-b border-current/30 pb-3 text-current'>{props.title}</p>
      <dl className='m-0 grid grid-cols-1 gap-x-6 sm:grid-cols-[8.5rem_minmax(0,1fr)]'>
        {props.rows.map((row) => (
          <div key={row.term} className='contents'>
            <dt className='label-mono pt-3 text-current/75 sm:border-b sm:border-current/15 sm:py-3'>
              {row.term}
            </dt>
            <dd className='m-0 border-b border-current/15 pb-3 font-serif text-[1.0625rem] leading-snug sm:py-3'>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <figcaption className='label-mono pt-3 text-current/75'>
        {HOME_COPY.specimenCaption}
      </figcaption>
    </figure>
  )
}
