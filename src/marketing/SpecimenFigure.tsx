import { SPECIMEN_CAPTION, type SpecimenSection } from '~/marketing/copy/products'

function Rows(props: {
  readonly rows: readonly { readonly term: string; readonly value: string }[]
}) {
  return (
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
  )
}

function Turns(props: {
  readonly turns: readonly { readonly speaker: string; readonly text: string }[]
}) {
  return (
    <ol className='m-0 list-none p-0'>
      {props.turns.map((turn) => (
        <li
          key={`${turn.speaker}-${turn.text}`}
          className='grid gap-x-6 border-b border-current/15 py-3 sm:grid-cols-[8.5rem_minmax(0,1fr)]'
        >
          <span className='label-mono text-current/75'>{turn.speaker}</span>
          <p className='m-0 font-serif text-[1.0625rem] leading-snug'>{turn.text}</p>
        </li>
      ))}
    </ol>
  )
}

function Prose(props: { readonly paragraphs: readonly string[] }) {
  return (
    <div className='border-b border-current/15 py-3'>
      {props.paragraphs.map((text) => (
        <p key={text} className='m-0 max-w-[52ch] font-serif text-[1.0625rem] leading-snug'>
          {text}
        </p>
      ))}
    </div>
  )
}

function Section(props: { readonly section: SpecimenSection }) {
  const { section } = props
  if (section.kind === 'rows') {
    return <Rows rows={section.rows} />
  }
  if (section.kind === 'turns') {
    return <Turns turns={section.turns} />
  }
  return <Prose paragraphs={section.paragraphs} />
}

/**
 * A typeset specimen of something the product will or does show: a hairline border, no shadow, in
 * the page's own type, built of labelled values, a typeset exchange or running text, and always
 * captioned as invented.
 */
export function SpecimenFigure(props: {
  readonly title: string
  readonly sections: readonly SpecimenSection[]
}) {
  return (
    <figure className='m-0 border border-current/50 p-5'>
      <p className='label-mono m-0 border-b border-current/30 pb-3 text-current'>{props.title}</p>
      {props.sections.map((section, index) => (
        <div key={`${section.kind}-${section.label ?? index}`}>
          {section.label === undefined ? null : (
            <p className='label-mono m-0 pt-4 pb-1 text-current'>{section.label}</p>
          )}
          <Section section={section} />
        </div>
      ))}
      <figcaption className='label-mono pt-3 text-current/75'>{SPECIMEN_CAPTION}</figcaption>
    </figure>
  )
}
