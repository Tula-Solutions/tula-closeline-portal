import { Link } from '@tanstack/react-router'
import { DEMO_PAGE } from '~/marketing/copy/demo'
import { SECURITY_PAGE } from '~/marketing/copy/security'
import { SITE_COPY } from '~/marketing/copy/site'
import { Part } from '~/marketing/Part'
import { SpecimenFigure } from '~/marketing/SpecimenFigure'
import { usePageMeta } from '~/marketing/usePageMeta'

const WIDTH = 'mx-auto max-w-[88rem] px-4 sm:px-8'

/**
 * The security and trust page: each rule as a numbered entry, with the plain-text status ("Enforced
 * by: ..." or "Our promise: ..."), one captioned specimen of a refusal, and a plain statement that
 * no certification is claimed.
 */
export function SecurityPage() {
  const copy = SECURITY_PAGE
  usePageMeta(copy.meta)
  return (
    <>
      <div className={WIDTH}>
        <section aria-labelledby='headline' className='md:grid md:grid-cols-12'>
          <div className='pt-6 md:col-span-3 md:pr-6'>
            <p className='label-mono m-0 text-foreground'>{copy.label}</p>
          </div>
          <div className='pt-4 pb-10 md:col-span-9 md:border-l md:border-border-strong md:pt-6 md:pb-16 md:pl-8'>
            <h1
              id='headline'
              className='m-0 max-w-[16ch] font-serif text-[clamp(2.75rem,8vw,6.5rem)] leading-[0.95] font-normal tracking-[-0.04em] text-balance'
            >
              {copy.headline.before}
              <em className='font-normal italic'>{copy.headline.emphasis}</em>
              {copy.headline.after}
            </h1>
            <p className='m-0 mt-8 max-w-[56ch] text-xl leading-relaxed'>{copy.lede}</p>
            <p className='m-0 mt-6 max-w-[56ch] border-t border-border-strong pt-3 text-sm leading-relaxed'>
              {copy.noCertification}
            </p>
          </div>
        </section>
      </div>

      <div className={WIDTH}>
        <Part
          id='rules'
          numeral={copy.rules.numeral}
          label={copy.rules.label}
          heading={copy.rules.heading}
        >
          <ol aria-label={copy.rules.listLabel} className='m-0 list-none p-0'>
            {copy.rules.items.map((rule, index) => (
              <li
                key={rule.id}
                className='border-t border-border-strong py-5 md:grid md:grid-cols-12 md:gap-x-6'
              >
                <p className='label-mono m-0 mb-2 text-foreground md:col-span-1 md:mb-0'>
                  {String(index + 1).padStart(2, '0')}
                </p>
                <div className='md:col-span-6'>
                  <h3 className='m-0 mb-2 font-serif text-2xl tracking-[-0.02em]'>{rule.title}</h3>
                  <p className='m-0 max-w-[48ch] leading-relaxed'>{rule.text}</p>
                </div>
                <div className='mt-3 md:col-span-5 md:mt-0 md:border-l md:border-border-strong md:pl-6'>
                  <p data-status className='m-0 text-sm leading-relaxed'>
                    {rule.status.line}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Part>

        <Part
          id='refusal'
          numeral={copy.specimen.numeral}
          label={copy.specimen.label}
          heading={copy.specimen.heading}
        >
          <div className='grid gap-8 lg:grid-cols-12'>
            <p className='m-0 max-w-[40ch] text-lg leading-relaxed lg:col-span-4'>
              {copy.specimen.intro}
            </p>
            <div className='lg:col-span-8'>
              <SpecimenFigure title={copy.specimen.title} sections={copy.specimen.sections} />
            </div>
          </div>
        </Part>
      </div>

      <div className={WIDTH}>
        <section
          aria-labelledby='start-heading'
          className='border-t border-rule-strong py-14 md:grid md:grid-cols-12'
        >
          <div className='md:col-span-3' />
          <div className='md:col-span-9 md:pl-8'>
            <h2
              id='start-heading'
              className='m-0 max-w-[20ch] font-serif text-[clamp(2rem,4.6vw,3.75rem)] leading-[1] font-normal tracking-[-0.03em]'
            >
              {copy.closing.heading}
            </h2>
            <p className='m-0 mt-4 max-w-[52ch] leading-relaxed'>{copy.closing.text}</p>
            <div className='mt-6'>
              <Link
                to='/sign-up'
                className='inline-flex h-11 items-center rounded-[4px] bg-foreground px-5 font-semibold text-background outline-hidden hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
              >
                {SITE_COPY.signUp}
              </Link>
              <Link
                to='/book-a-demo'
                className='rounded-sm underline decoration-border-strong decoration-1 underline-offset-4 outline-hidden hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring'
              >
                {DEMO_PAGE.navLabel}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
