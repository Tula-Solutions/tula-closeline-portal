import { Outlet, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useSessionState } from '~/app-context'
import { parseReturnPath } from '~/data/return-path'
import { Logo, ScalesMark } from '~/ui/Logo'
import { reveal } from '~/ui/motion'

const POINTS = [
  {
    title: 'Copilot',
    text: 'Advises your Rep live, during the conversation.',
  },
  {
    title: 'Inbound Agent',
    text: 'Qualifies the Prospects who reach out, then books them or hands them to a Rep.',
  },
  {
    title: 'Playbook',
    text: 'The material you uploaded and what your won Deals teach.',
  },
] as const

/**
 * The frame around sign-in and sign-up: the logo above a single column. A signed-in person is sent
 * to the home route from here, so a sign-in that finishes while its screen is gone still lands.
 */
export function PublicLayout() {
  const session = useSessionState()
  const navigate = useNavigate()
  const router = useRouter()
  const signedIn = session.status === 'signed_in'
  const headline = useRef<HTMLDivElement>(null)
  // The headline's lines rise 80 ms apart while the scales draw beside them (set before paint).
  useLayoutEffect(() => {
    reveal(headline.current?.children ?? [], {
      delay: 200,
      step: 80,
      rise: '0.3em',
      duration: 420,
    })
  }, [])
  const back = parseReturnPath(
    new URLSearchParams(useRouterState({ select: (state) => state.location.searchStr })).get(
      'redirect'
    )
  )
  // Once: the address changes under this layout as it leaves, and it must not send the person on again.
  const sent = useRef(false)
  useEffect(() => {
    if (signedIn && !sent.current) {
      sent.current = true
      if (back === undefined) {
        void navigate({ to: '/', replace: true })
      } else {
        // `back` passed parseReturnPath: a relative address of this portal, so the router can take it as it is.
        router.history.replace(back)
      }
    }
  }, [signedIn, navigate, back, router])
  return (
    <div className='grid min-h-dvh lg:grid-cols-12'>
      <aside
        className='relative isolate hidden flex-col justify-between overflow-hidden border-r px-14 py-12 lg:col-span-7 lg:flex xl:px-20'
        aria-label='About Closeline'
      >
        <Logo className='w-32' />
        <ScalesMark
          drawIn
          className='pointer-events-none absolute top-[4%] -right-24 -z-10 w-[46rem] text-foreground/22'
        />
        <div ref={headline} className='max-w-[40rem]'>
          <p className='m-0 font-serif text-[3.5rem] leading-[1] font-normal tracking-[-0.03em] text-balance xl:text-[4.5rem]'>
            Live guidance for every Rep. Agents for the rest.
          </p>
          <p className='mt-6 mb-0 max-w-[46ch] text-[1.0625rem] leading-relaxed text-muted-foreground'>
            Closeline learns from your own Playbook and your won Deals, so what it suggests sounds
            like your best seller.
          </p>
        </div>
        <ul className='m-0 grid max-w-[44rem] list-none grid-cols-3 gap-8 border-t border-rule-strong p-0 pt-5'>
          {POINTS.map((point) => (
            <li key={point.title}>
              <span className='label-mono block text-foreground'>{point.title}</span>
              <span className='mt-2 block text-sm leading-snug text-muted-foreground'>
                {point.text}
              </span>
            </li>
          ))}
        </ul>
      </aside>
      <main
        id='main'
        className='flex flex-col px-5 pt-[max(3rem,18vh)] pb-12 [view-transition-name:page] sm:px-12 lg:col-span-5 xl:px-16'
      >
        <div className='mx-auto w-full max-w-[24rem] motion-safe:animate-rise lg:mx-0'>
          <Logo className='mb-12 w-[7.5rem] lg:hidden' />
          <Outlet />
        </div>
      </main>
    </div>
  )
}
