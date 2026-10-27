import { useEffect, useRef } from 'react'

/** The most the beam leans, in degrees, over a page's length. */
const MAX_TILT_DEGREES = 6
/** The beam rests at the level of the mark's own beam, and swings about this point. */
const PIVOT_Y = -34
const HALF_BEAM = 60

/** Where the beam and the two pans sit when the page is this far down (0 at the top, 1 at the foot). */
export function scalePose(progress: number) {
  const angle = (MAX_TILT_DEGREES * Math.sin(progress * 2 * Math.PI) * Math.PI) / 180
  const lift = HALF_BEAM * Math.sin(angle)
  const draw = HALF_BEAM * (1 - Math.cos(angle))
  return {
    beam: `rotate(${(angle * 180) / Math.PI} 0 ${PIVOT_Y})`,
    left: `translate(${draw} ${-lift})`,
    right: `translate(${-draw} ${lift})`,
  }
}

/**
 * The balance scale of the Tula mark, drawn from the mark's own lines and circles: the post and
 * base, the beam, a solid pan (the AI) and an open pan (the human). It leans slowly as the page
 * scrolls and is completely still when the reader prefers reduced motion: then no scroll listener
 * is added at all. Decoration only; the caption beside it says what it shows.
 */
export function Scale(props: { readonly className?: string }) {
  const beam = useRef<SVGGElement>(null)
  const left = useRef<SVGGElement>(null)
  const right = useRef<SVGGElement>(null)
  useEffect(() => {
    const reduce =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : undefined
    if (reduce?.matches === true) {
      return undefined
    }
    let frame = 0
    const apply = () => {
      frame = 0
      const room = document.documentElement.scrollHeight - window.innerHeight
      const progress = room > 0 ? Math.min(1, Math.max(0, window.scrollY / room)) : 0
      const pose = scalePose(progress)
      beam.current?.setAttribute('transform', pose.beam)
      left.current?.setAttribute('transform', pose.left)
      right.current?.setAttribute('transform', pose.right)
    }
    const onScroll = () => {
      if (frame === 0) {
        frame = window.requestAnimationFrame(apply)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame !== 0) {
        window.cancelAnimationFrame(frame)
      }
    }
  }, [])
  return (
    <svg
      aria-hidden='true'
      focusable='false'
      data-scale
      viewBox='-84 -62 168 130'
      fill='none'
      stroke='currentColor'
      strokeWidth='5'
      strokeLinecap='round'
      className={props.className}
    >
      <line x1='0' y1='-52' x2='0' y2='56' />
      <line x1='-26' y1='56' x2='26' y2='56' />
      <g ref={beam} data-part='beam'>
        <line x1='-60' y1='-34' x2='60' y2='-34' />
      </g>
      <g ref={left} data-part='solid-pan'>
        <line x1='-60' y1='-34' x2='-60' y2='-10' />
        <circle cx='-60' cy='4' r='14' fill='currentColor' />
      </g>
      <g ref={right} data-part='open-pan'>
        <line x1='60' y1='-34' x2='60' y2='-10' />
        <circle cx='60' cy='4' r='14' />
      </g>
    </svg>
  )
}
