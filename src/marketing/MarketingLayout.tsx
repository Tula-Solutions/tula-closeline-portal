import { Link } from '@tanstack/react-router'
import { Menu, X } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { SITE_COPY } from '~/marketing/copy/site'

const LINK =
  'rounded-sm underline decoration-border-strong decoration-1 underline-offset-4 outline-hidden hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring'

const NAV_LINK =
  'inline-flex min-h-11 items-center rounded-sm py-1.5 outline-hidden md:min-h-0 hover:underline focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-4'

/** The Tula lockup from the brand files: ink on paper by day, paper on ink in the dark theme. */
function Wordmark(props: { readonly className: string }) {
  return (
    <>
      <img
        src='/brand/lockup-horizontal-ink.svg'
        alt={SITE_COPY.logoAlt}
        width='720'
        height='240'
        className={`${props.className} dark:hidden`}
      />
      <img
        src='/brand/lockup-horizontal-paper-on-ink.svg'
        alt={SITE_COPY.logoAlt}
        width='720'
        height='240'
        className={`${props.className} hidden dark:block`}
      />
    </>
  )
}

/** The section links: a row at `md` and wider, a Menu disclosure below it. */
function SectionNav() {
  const [open, setOpen] = useState(false)
  const listId = useId()
  return (
    <div className='border-t border-border-strong'>
      <button
        type='button'
        aria-expanded={open}
        aria-controls={listId}
        className='-ml-2 inline-flex h-11 items-center gap-2 rounded-sm px-2 text-sm font-medium outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring md:hidden'
        onClick={() => setOpen((now) => !now)}
      >
        {open ? (
          <X aria-hidden='true' className='size-4' />
        ) : (
          <Menu aria-hidden='true' className='size-4' />
        )}
        {SITE_COPY.menu}
      </button>
      <nav
        id={listId}
        aria-label={SITE_COPY.navLabel}
        className={`${open ? 'block' : 'hidden'} pb-2 text-sm md:block md:py-2`}
      >
        <ul className='m-0 flex list-none flex-col gap-x-6 gap-y-0 p-0 md:flex-row md:flex-wrap md:gap-y-1'>
          {SITE_COPY.nav.map((item) => (
            <li key={item.to}>
              <Link to={item.to} className={NAV_LINK} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

/**
 * The frame of every marketing page: a skip link, the header (wordmark, section links, Sign in and
 * Sign up), the page in `main`, and the footer (legal links and the Region note). Later pages use
 * it as their layout.
 */
export function MarketingLayout(props: { readonly children: ReactNode }) {
  return (
    <div className='min-h-dvh bg-background text-foreground'>
      <a
        href='#main'
        className='sr-only z-[60] rounded-md bg-foreground px-4 py-2 text-background focus:not-sr-only focus:fixed focus:top-3 focus:left-3'
      >
        {SITE_COPY.skipToContent}
      </a>
      <header className='border-b border-rule-strong'>
        <div className='mx-auto max-w-[88rem] px-4 sm:px-8'>
          <div className='flex items-center justify-between gap-4 py-4'>
            <Link
              to='/'
              className='rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring'
            >
              <Wordmark className='h-auto w-[10rem]' />
            </Link>
            <div className='flex items-center gap-4 text-sm font-medium'>
              <Link to='/sign-in' className={LINK}>
                {SITE_COPY.signIn}
              </Link>
              <Link
                to='/sign-up'
                className='inline-flex h-10 items-center rounded-[4px] bg-foreground px-4 font-semibold text-background outline-hidden hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background pointer-coarse:h-11'
              >
                {SITE_COPY.signUp}
              </Link>
            </div>
          </div>
          <SectionNav />
        </div>
      </header>
      <main id='main' tabIndex={-1} className='outline-hidden'>
        {props.children}
      </main>
      <footer className='border-t border-rule-strong'>
        <div className='mx-auto max-w-[88rem] px-4 py-8 sm:px-8 md:grid md:grid-cols-12'>
          <div className='md:col-span-3 md:pr-6'>
            <Wordmark className='h-auto w-[10rem]' />
          </div>
          <div className='mt-6 md:col-span-6 md:mt-0 md:border-l md:border-border-strong md:px-8'>
            <p className='label-mono m-0 mb-2'>{SITE_COPY.footer.regionLabel}</p>
            <p className='m-0 max-w-[48ch] text-sm leading-relaxed'>
              {SITE_COPY.footer.regionNote}
            </p>
          </div>
          <nav
            aria-label={SITE_COPY.footer.legalLabel}
            className='mt-6 md:col-span-3 md:mt-0 md:border-l md:border-border-strong md:pl-8'
          >
            <ul className='m-0 flex list-none flex-col gap-2 p-0 text-sm'>
              {SITE_COPY.footer.legal.map((item) => (
                <li key={item.label}>
                  {item.href === null ? (
                    <span className='text-muted-foreground'>
                      {`${item.label} (${SITE_COPY.footer.notPublished})`}
                    </span>
                  ) : (
                    <a href={item.href} className={LINK}>
                      {item.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  )
}
