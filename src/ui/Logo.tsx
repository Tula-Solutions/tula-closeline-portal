import { useEffect, useRef } from 'react'
import { cn } from '~/lib/utils'
import { EASE, firstTimeThisSession, play } from '~/ui/motion'

/** One stroke drawn from its start to its end over [from, to] ms (its pathLength is 1). */
function drawStroke(element: Element, from: number, to: number): void {
  play(element, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
    duration: to - from,
    delay: from,
    easing: EASE.out,
    fill: 'backwards',
  })
}

/**
 * Draws the scales once: the construction lines fade in (0-400 ms), the post rises (0-500), the
 * beam draws out from the pivot (300-800), the hangers drop (700-1000) and the pans close
 * (900-1300); then the beam and pans rock to rest about the pivot (1300-2700). Every step is a Web
 * Animation that `play` skips under reduced motion, so the drawing is simply there.
 */
function drawScales(svg: SVGSVGElement): void {
  const parts = (name: string) => svg.querySelectorAll(`[data-part="${name}"]`)
  for (const line of parts('construction')) {
    play(line, [{ opacity: 0 }, { opacity: 1 }], {
      duration: 400,
      easing: EASE.out,
      fill: 'backwards',
    })
  }
  for (const line of parts('post')) {
    drawStroke(line, 0, 500)
  }
  for (const line of parts('beam')) {
    drawStroke(line, 300, 800)
  }
  for (const line of parts('hanger')) {
    drawStroke(line, 700, 1000)
  }
  for (const pan of parts('pan')) {
    drawStroke(pan, 900, 1300)
  }
  play(
    svg.querySelector('[data-part="rocker"]'),
    [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-4deg)' },
      { transform: 'rotate(2.2deg)' },
      { transform: 'rotate(-1deg)' },
      { transform: 'rotate(0.4deg)' },
      { transform: 'rotate(0deg)' },
    ],
    { duration: 1400, delay: 1300, easing: EASE.move }
  )
}

/**
 * The Tula scales drawn large as a line illustration: the brand mark's geometry at a hairline
 * weight, with its construction lines (the beam's level and the baseline) left in. Decoration only;
 * it takes the text colour, so the caller sets a low-contrast ink. With `drawIn` it draws itself
 * the first time it is shown in a tab (and never under reduced motion). Strokes are in user units,
 * not `vector-effect: non-scaling-stroke`, because Safari ignores `pathLength` on non-scaling
 * strokes and the dash-drawing would break there.
 */
export function ScalesMark(props: { readonly className?: string; readonly drawIn?: boolean }) {
  const svg = useRef<SVGSVGElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: it draws once, when first shown
  useEffect(() => {
    if (props.drawIn && svg.current !== null && firstTimeThisSession()) {
      drawScales(svg.current)
    }
  }, [])
  return (
    <svg
      ref={svg}
      aria-hidden='true'
      focusable='false'
      viewBox='-120 -110 240 220'
      fill='none'
      stroke='currentColor'
      strokeLinecap='round'
      className={cn('h-auto', props.className)}
    >
      <g strokeWidth='0.3' strokeDasharray='1' strokeDashoffset='0'>
        <line data-part='post' x1='0' y1='56' x2='0' y2='-49' pathLength='1' />
        <line data-part='post' x1='-26' y1='56' x2='26' y2='56' pathLength='1' />
        {/* The beam, its hangers and pans rock about the pivot (0, -34). */}
        <g data-part='rocker' className='origin-[0px_-34px] [transform-box:view-box]'>
          <line data-part='beam' x1='0' y1='-34' x2='-60' y2='-34' pathLength='1' />
          <line data-part='beam' x1='0' y1='-34' x2='60' y2='-34' pathLength='1' />
          <line data-part='hanger' x1='-60' y1='-34' x2='-60' y2='-11' pathLength='1' />
          <line data-part='hanger' x1='60' y1='-34' x2='60' y2='-11' pathLength='1' />
          <circle data-part='pan' cx='-60' cy='4' r='15' pathLength='1' />
          <circle data-part='pan' cx='60' cy='4' r='15' pathLength='1' />
        </g>
        <circle data-part='beam' cx='0' cy='-52' r='3' pathLength='1' />
      </g>
      <g strokeWidth='0.18' strokeDasharray='0.65 1.3' opacity='0.7'>
        <line data-part='construction' x1='-112' y1='-34' x2='112' y2='-34' />
        <line data-part='construction' x1='-112' y1='56' x2='112' y2='56' />
        <line data-part='construction' x1='0' y1='-104' x2='0' y2='104' />
        <circle data-part='construction' cx='0' cy='-34' r='60' />
      </g>
    </svg>
  )
}

/**
 * The horizontal Tula lockup, drawn from the brand master: ink on paper in the light theme and
 * paper on ink in the dark one (it takes the text colour). It is never drawn smaller than 120 px
 * wide, and the caller keeps clear space around it.
 */
export function Logo(props: { readonly className?: string }) {
  return (
    <svg
      role='img'
      aria-label='Tula Solution'
      viewBox='0 0 720 240'
      width='160'
      height='53'
      className={cn('h-auto w-40 text-foreground', props.className)}
    >
      <g
        transform='translate(108 112) scale(0.92)'
        stroke='currentColor'
        strokeWidth='6.5'
        strokeLinecap='round'
      >
        <line x1='0' y1='-52' x2='0' y2='56' />
        <line x1='-60' y1='-34' x2='60' y2='-34' />
        <line x1='-26' y1='56' x2='26' y2='56' />
        <line x1='-60' y1='-34' x2='-60' y2='-10' />
        <line x1='60' y1='-34' x2='60' y2='-10' />
        <circle cx='-60' cy='4' r='15' fill='currentColor' stroke='none' />
        <circle cx='60' cy='4' r='15' fill='none' />
      </g>
      <text
        x='222'
        y='112'
        fontFamily='Helvetica, Arial, sans-serif'
        fontSize='76'
        fontWeight='700'
        fill='currentColor'
        letterSpacing='-2'
      >
        tula
      </text>
      <text
        x='226'
        y='156'
        fontFamily='Helvetica, Arial, sans-serif'
        fontSize='24'
        fontWeight='500'
        fill='currentColor'
        fillOpacity='0.7'
        letterSpacing='11'
      >
        SOLUTION
      </text>
    </svg>
  )
}
