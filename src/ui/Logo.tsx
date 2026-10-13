import lockupInk from '../../brand/lockup-horizontal-ink.svg'
import lockupPaper from '../../brand/lockup-horizontal-paper-on-ink.svg'

/**
 * The horizontal lockup, unaltered: ink on paper, and the paper-on-ink master in a dark scheme.
 * It is never drawn smaller than 120 px wide, and the CSS keeps clear space around it.
 */
export function Logo() {
  return (
    <picture className='logo'>
      <source srcSet={lockupPaper} media='(prefers-color-scheme: dark)' />
      <img src={lockupInk} alt='Tula Solution' width='160' height='53' />
    </picture>
  )
}
