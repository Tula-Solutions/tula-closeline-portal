import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '~/components/ui/button'
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
  const Icon = choice === 'dark' ? Moon : choice === 'light' ? Sun : Monitor
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='sm' className='justify-start'>
          <Icon aria-hidden='true' />
          Appearance
        </Button>
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
