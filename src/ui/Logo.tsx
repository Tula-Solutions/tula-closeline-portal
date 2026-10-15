import { cn } from '~/lib/utils'

/**
 * The Tula scales drawn large as a line illustration: the brand mark's geometry at a hairline
 * weight, with its construction lines (the beam's level and the baseline) left in. Decoration only;
 * it takes the text colour, so the caller sets a low-contrast ink.
 */
export function ScalesMark(props: { readonly className?: string }) {
  return (
    <svg
      aria-hidden='true'
      focusable='false'
      viewBox='-120 -110 240 220'
      fill='none'
      stroke='currentColor'
      strokeLinecap='round'
      className={cn('h-auto', props.className)}
    >
      <g strokeWidth='0.75' vectorEffect='non-scaling-stroke'>
        <line x1='0' y1='-52' x2='0' y2='56' vectorEffect='non-scaling-stroke' />
        <line x1='-60' y1='-34' x2='60' y2='-34' vectorEffect='non-scaling-stroke' />
        <line x1='-26' y1='56' x2='26' y2='56' vectorEffect='non-scaling-stroke' />
        <line x1='-60' y1='-34' x2='-60' y2='-11' vectorEffect='non-scaling-stroke' />
        <line x1='60' y1='-34' x2='60' y2='-11' vectorEffect='non-scaling-stroke' />
        <circle cx='-60' cy='4' r='15' vectorEffect='non-scaling-stroke' />
        <circle cx='60' cy='4' r='15' vectorEffect='non-scaling-stroke' />
        <circle cx='0' cy='-52' r='3' vectorEffect='non-scaling-stroke' />
      </g>
      <g strokeWidth='0.5' strokeDasharray='2 4' opacity='0.7'>
        <line x1='-112' y1='-34' x2='112' y2='-34' vectorEffect='non-scaling-stroke' />
        <line x1='-112' y1='56' x2='112' y2='56' vectorEffect='non-scaling-stroke' />
        <line x1='0' y1='-104' x2='0' y2='104' vectorEffect='non-scaling-stroke' />
        <circle cx='0' cy='-34' r='60' vectorEffect='non-scaling-stroke' />
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
