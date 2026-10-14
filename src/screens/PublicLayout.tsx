import { Outlet, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { BookOpen, Headset, PhoneIncoming } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useSessionState } from '~/app-context'
import { parseReturnPath } from '~/data/return-path'
import { Logo } from '~/ui/Logo'

const POINTS = [
  {
    icon: Headset,
    title: 'Copilot',
    text: 'Advises your Rep live, during the conversation.',
  },
  {
    icon: PhoneIncoming,
    title: 'Inbound Agent',
    text: 'Qualifies the Prospects who reach out, then books them or hands them to a Rep.',
  },
  {
    icon: BookOpen,
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
    <div className='grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]'>
      <aside
        className='brand-panel hidden flex-col justify-between p-12 lg:flex xl:p-14'
        aria-label='About Closeline'
      >
        <Logo className='w-40 text-[#f1efe8]' />
        <svg
          aria-hidden='true'
          viewBox='-80 -80 160 160'
          className='pointer-events-none absolute -right-28 -bottom-28 -z-10 size-[30rem] text-[#f1efe8] opacity-[0.07]'
          fill='none'
          stroke='currentColor'
          strokeWidth='3'
          strokeLinecap='round'
        >
          <line x1='0' y1='-52' x2='0' y2='56' />
          <line x1='-60' y1='-34' x2='60' y2='-34' />
          <line x1='-26' y1='56' x2='26' y2='56' />
          <line x1='-60' y1='-34' x2='-60' y2='-10' />
          <line x1='60' y1='-34' x2='60' y2='-10' />
          <circle cx='-60' cy='4' r='15' fill='currentColor' />
          <circle cx='60' cy='4' r='15' />
        </svg>
        <div className='relative max-w-md motion-safe:animate-rise'>
          <p className='m-0 text-[2rem] leading-[1.15] font-semibold tracking-[-0.025em] text-balance'>
            Live guidance for every Rep. Agents for the rest.
          </p>
          <p className='mt-4 mb-0 text-base leading-relaxed text-[#f1efe8]/75'>
            Closeline learns from your own Playbook and your won Deals, so what it suggests sounds
            like your best seller.
          </p>
          <ul className='mt-10 mb-0 grid list-none gap-4 p-0'>
            {POINTS.map((point) => (
              <li key={point.title} className='flex items-start gap-3'>
                <span
                  aria-hidden='true'
                  className='flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#f1efe8]/15 bg-[#f1efe8]/[0.06] text-[#8daeff]'
                >
                  <point.icon className='size-[18px]' />
                </span>
                <span className='flex flex-col'>
                  <span className='text-sm font-semibold'>{point.title}</span>
                  <span className='text-sm text-[#f1efe8]/70'>{point.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className='relative m-0 text-xs text-[#f1efe8]/60'>Closeline by Tula Solution</p>
      </aside>
      <main
        id='main'
        className='auth-backdrop flex flex-col items-center justify-center px-4 py-10 sm:px-8'
      >
        <div className='w-full max-w-md motion-safe:animate-rise'>
          <Logo className='mb-8 w-36 lg:hidden' />
          <div className='rounded-2xl border bg-card p-6 shadow-elev-3 sm:p-8'>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}
