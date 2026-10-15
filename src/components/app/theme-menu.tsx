import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { setThemeChoice, type ThemeChoice, useThemeChoice } from '~/ui/theme'

const CHOICES: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match the system' },
]

/** The menu where the person picks light, dark or the system theme. */
export function ThemeMenu() {
  const choice = useThemeChoice()
  const current = choice === 'dark' ? 'Dark' : choice === 'light' ? 'Light' : 'System'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          className='flex w-full items-baseline justify-between rounded-sm py-1.5 text-left text-sm text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-2.5'
        >
          Appearance
          <span aria-hidden='true' className='label-mono'>
            {current}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' side='top'>
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={choice}
          onValueChange={(value) => {
            if (value === 'light' || value === 'dark' || value === 'system') {
              setThemeChoice(value)
            }
          }}
        >
          {CHOICES.map((item) => (
            <DropdownMenuRadioItem key={item.value} value={item.value}>
              {item.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
