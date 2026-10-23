import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { HOME_COPY } from '~/marketing/copy/home'
import { HOME_META, SITE_COPY } from '~/marketing/copy/site'
import { Part } from '~/marketing/Part'
import { Scale } from '~/marketing/Scale'
import { Specimen } from '~/marketing/Specimen'
import { usePageMeta } from '~/marketing/usePageMeta'

const WIDTH = 'mx-auto max-w-[88rem] px-4 sm:px-8'

function Paragraphs(props: { readonly items: readonly string[] }) {
  return (
    <div className='max-w-[60ch] space-y-4 text-[1.0625rem] leading-relaxed'>
      {props.items.map((text) => (
        <p key={text} className='m-0'>
          {text}
        </p>
      ))}
    </div>
  )
}

function Frame(props: { readonly children: ReactNode }) {
  return <div className={WIDTH}>{props.children}</div>
}

/**
 * The signed-out home page, set as a broadsheet: a masthead, a headline with the Tula scale, the
 * parts of the product one after another (each saying whether it is built), one ink band for the
 * two rules that bind every Agent, and a way in.
 */
export function MarketingHome() {
  usePageMeta(HOME_META)
  const copy = HOME_COPY
  return (
    <>
      <Frame>
        <section aria-labelledby='headline' className='md:grid md:grid-cols-12'>
          <div className='pt-6 md:col-span-3 md:pr-6'>
            <p className='label-mono m-0 text-foreground'>{copy.masthead}</p>
          </div>
          <div className='pt-4 pb-10 md:col-span-9 md:border-l md:border-border-strong md:pt-6 md:pb-16 md:pl-8'>
            <h1
              id='headline'
              className='m-0 max-w-[14ch] font-serif text-[clamp(3rem,10vw,8.5rem)] leading-[0.92] font-normal tracking-[-0.045em] text-balance'
            >
              {copy.hero.before}
              <em className='font-normal italic'>{copy.hero.emphasis}</em>
              {copy.hero.after}
            </h1>
            <div className='mt-10 grid gap-8 lg:grid-cols-12'>
              <div className='lg:col-span-7'>
                <p className='m-0 max-w-[52ch] text-xl leading-relaxed'>{copy.hero.lede}</p>
                <p className='m-0 mt-6 max-w-[52ch] border-t border-border-strong pt-3 text-sm leading-relaxed'>
                  <span className='label-mono mr-2'>{copy.hero.statusLabel}</span>
                  {copy.hero.status}
                </p>
                <div className='mt-8 flex flex-wrap items-center gap-4'>
                  <Link
                    to='/sign-up'
                    className='inline-flex h-11 items-center rounded-[4px] bg-foreground px-5 font-semibold text-background outline-hidden hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                  >
                    {SITE_COPY.signUp}
                  </Link>
                </div>
              </div>
              <figure className='m-0 lg:col-span-5'>
                <Scale className='mx-auto h-auto w-full max-w-[22rem] text-foreground' />
                <figcaption className='label-mono mt-3 text-center'>
                  {copy.hero.scaleCaption}
                </figcaption>
              </figure>
            </div>
          </div>
        </section>
      </Frame>

      <Frame>
        <Part numeral={copy.fit.numeral} label={copy.fit.label} heading={copy.fit.heading}>
          <div className='grid gap-0 md:grid-cols-2'>
            {copy.fit.columns.map((column, index) => (
              <div
                key={column.title}
                className={`border-t border-border-strong py-4 ${index === 0 ? 'md:pr-6' : 'md:border-l md:pl-6'}`}
              >
                <h3 className='m-0 mb-2 font-serif text-2xl tracking-[-0.02em]'>{column.title}</h3>
                <p className='m-0 max-w-[40ch] leading-relaxed'>{column.text}</p>
              </div>
            ))}
          </div>
          <div className='border-t border-rule-strong py-4'>
            <h3 className='m-0 mb-2 font-serif text-2xl tracking-[-0.02em]'>
              {copy.fit.foundationTitle}
            </h3>
            <p className='m-0 max-w-[60ch] leading-relaxed'>{copy.fit.foundation}</p>
          </div>
        </Part>

        {[copy.copilot, copy.inbound, copy.outbound].map((part) => (
          <Part
            key={part.id}
            id={part.id}
            numeral={part.numeral}
            label={part.label}
            availability={part.availability}
            heading={part.heading}
          >
            <Paragraphs items={part.paragraphs} />
          </Part>
        ))}

        <Part
          id={copy.playbook.id}
          numeral={copy.playbook.numeral}
          label={copy.playbook.label}
          availability={copy.playbook.availability}
          heading={copy.playbook.heading}
        >
          <div className='grid gap-10 lg:grid-cols-2'>
            <div>
              <Paragraphs items={copy.playbook.paragraphs} />
              <p className='label-mono m-0 mt-8 mb-2'>{copy.playbook.built.label}</p>
              <ul className='m-0 list-none p-0'>
                {copy.playbook.built.items.map((item) => (
                  <li key={item} className='border-t border-border-strong py-2 font-serif text-xl'>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <Specimen title={copy.playbook.specimen.title} rows={copy.playbook.specimen.rows} />
          </div>
        </Part>
      </Frame>

      <section
        id={copy.trust.id}
        aria-labelledby='trust-heading'
        className='scroll-mt-4 bg-foreground text-background'
      >
        <Frame>
          <div className='md:grid md:grid-cols-12'>
            <div className='pt-6 md:col-span-3 md:pr-6'>
              <p className='label-mono m-0 text-background'>
                {`${copy.trust.numeral} / ${copy.trust.label}`}
              </p>
            </div>
            <div className='pt-4 pb-14 md:col-span-9 md:border-l md:border-background/50 md:pt-6 md:pb-20 md:pl-8'>
              <h2
                id='trust-heading'
                className='m-0 mb-8 max-w-[18ch] font-serif text-[clamp(2.25rem,5.5vw,4.5rem)] leading-[0.98] font-normal tracking-[-0.035em] text-balance'
              >
                {copy.trust.heading}
              </h2>
              <div className='grid gap-10 lg:grid-cols-2'>
                <div>
                  <ol className='m-0 list-none p-0'>
                    {copy.trust.rules.map((rule) => (
                      <li key={rule.title} className='border-t border-background/50 py-4'>
                        <h3 className='m-0 mb-2 font-serif text-2xl tracking-[-0.02em]'>
                          {rule.title}
                        </h3>
                        <p className='m-0 max-w-[48ch] leading-relaxed'>{rule.text}</p>
                      </li>
                    ))}
                  </ol>
                  <p className='m-0 mt-2 max-w-[48ch] border-t border-background/50 pt-4 text-sm leading-relaxed'>
                    {copy.trust.status}
                  </p>
                  <p className='label-mono m-0 mt-3 text-background'>{copy.trust.reference}</p>
                </div>
                <Specimen title={copy.trust.specimen.title} rows={copy.trust.specimen.rows} />
              </div>
            </div>
          </div>
        </Frame>
      </section>

      <Frame>
        <section aria-labelledby='start-heading' className='py-14 md:grid md:grid-cols-12'>
          <div className='md:col-span-3' />
          <div className='md:col-span-9 md:pl-8'>
            <h2
              id='start-heading'
              className='m-0 max-w-[16ch] font-serif text-[clamp(2rem,4.6vw,3.75rem)] leading-[1] font-normal tracking-[-0.03em]'
            >
              {copy.start.heading}
            </h2>
            <p className='m-0 mt-4 max-w-[48ch] leading-relaxed'>{copy.start.text}</p>
            <Link
              to='/sign-up'
              className='mt-6 inline-flex h-11 items-center rounded-[4px] bg-foreground px-5 font-semibold text-background outline-hidden hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
            >
              {SITE_COPY.signUp}
            </Link>
          </div>
        </section>
      </Frame>
    </>
  )
}
