import { Link } from '@tanstack/react-router'
import { PRODUCT_COMMON, type ProductPageCopy } from '~/marketing/copy/products'
import { SITE_COPY } from '~/marketing/copy/site'
import { Part } from '~/marketing/Part'
import { SpecimenFigure } from '~/marketing/SpecimenFigure'
import { usePageMeta } from '~/marketing/usePageMeta'

const WIDTH = 'mx-auto max-w-[88rem] px-4 sm:px-8'

/** One ruled list of what is built or planned, headed by its label. */
function LedgerGroup(props: { readonly label: string; readonly items: readonly string[] }) {
  return (
    <div>
      <h3 className='label-mono m-0 mb-2 text-foreground'>{props.label}</h3>
      <ul className='m-0 list-none p-0'>
        {props.items.map((item) => (
          <li key={item} className='border-t border-border-strong py-3 font-serif text-xl'>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * A product page on one typeset template: the statement, how it works in numbered parts, one
 * captioned specimen, and a ledger of what is built today and what is planned, by phase. A part
 * that is not built says so in words, and the ledger never lists it as working.
 */
export function ProductPage(props: { readonly copy: ProductPageCopy }) {
  const { copy } = props
  usePageMeta(copy.meta)
  return (
    <>
      <div className={WIDTH}>
        <section aria-labelledby='headline' className='md:grid md:grid-cols-12'>
          <div className='pt-6 md:col-span-3 md:pr-6'>
            <p className='label-mono m-0 text-foreground'>{copy.label}</p>
            <p className='label-mono m-0 mt-1'>{copy.availability.label}</p>
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
              <span className='label-mono mr-2'>{PRODUCT_COMMON.todayLabel}</span>
              {copy.today}
            </p>
            {copy.rule === undefined ? null : (
              <p className='label-mono m-0 mt-3 text-foreground'>{copy.rule}</p>
            )}
          </div>
        </section>
      </div>

      <div className={WIDTH}>
        <Part
          id='how-it-works'
          numeral={PRODUCT_COMMON.how.numeral}
          label={PRODUCT_COMMON.how.label}
          heading={copy.how.heading}
        >
          <ol className='m-0 grid list-none gap-0 p-0 md:grid-cols-2'>
            {copy.how.steps.map((step, index) => (
              <li
                key={step.title}
                className={`border-t border-border-strong py-4 ${index % 2 === 1 ? 'md:border-l md:pl-6' : 'md:pr-6'}`}
              >
                <p className='label-mono m-0 mb-2 text-foreground'>
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className='m-0 mb-2 font-serif text-2xl tracking-[-0.02em]'>{step.title}</h3>
                <p className='m-0 max-w-[44ch] leading-relaxed'>{step.text}</p>
              </li>
            ))}
          </ol>
        </Part>

        <Part
          id='in-practice'
          numeral={PRODUCT_COMMON.specimen.numeral}
          label={PRODUCT_COMMON.specimen.label}
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

        <Part
          id='built-and-planned'
          numeral={PRODUCT_COMMON.ledger.numeral}
          label={PRODUCT_COMMON.ledger.label}
          heading={copy.ledger.heading}
        >
          <div className='grid gap-10 lg:grid-cols-2'>
            <LedgerGroup
              label={PRODUCT_COMMON.builtLabel}
              items={copy.ledger.built.length > 0 ? copy.ledger.built : [PRODUCT_COMMON.builtNone]}
            />
            <div className='space-y-8'>
              {copy.ledger.planned.map((group) => (
                <LedgerGroup key={group.label} label={group.label} items={group.items} />
              ))}
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
              {PRODUCT_COMMON.closing.heading}
            </h2>
            <p className='m-0 mt-4 max-w-[52ch] leading-relaxed'>{PRODUCT_COMMON.closing.text}</p>
            <div className='mt-6 flex flex-wrap items-center gap-6'>
              <Link
                to='/sign-up'
                className='inline-flex h-11 items-center rounded-[4px] bg-foreground px-5 font-semibold text-background outline-hidden hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
              >
                {SITE_COPY.signUp}
              </Link>
              {copy.path === '/the-playbook' ? null : (
                <Link
                  to='/the-playbook'
                  className='rounded-sm underline decoration-border-strong decoration-1 underline-offset-4 outline-hidden hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring'
                >
                  {PRODUCT_COMMON.closing.link}
                </Link>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
