const STEPS = ['Choose a file', 'Watch progress', 'Read the report'] as const

/** The three steps of an import as an ordered list, the current one marked for assistive technology. */
export function ImportSteps(props: { readonly current: 0 | 1 | 2 }) {
  return (
    <ol
      aria-label='Steps'
      className='label-mono m-0 mb-8 flex list-none flex-wrap gap-x-6 gap-y-2 p-0'
    >
      {STEPS.map((step, index) => (
        <li
          key={step}
          aria-current={index === props.current ? 'step' : undefined}
          className={
            index === props.current ? 'font-semibold text-foreground' : 'text-muted-foreground'
          }
        >
          {index + 1}. {step}
        </li>
      ))}
    </ol>
  )
}
