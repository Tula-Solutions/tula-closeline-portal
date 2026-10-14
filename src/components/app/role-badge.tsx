import type { Role } from 'tula-closeline-contract'
import { Badge } from '~/components/ui/badge'
import { ROLE_LABEL } from '~/data/permissions'

const VARIANT: Record<Role, 'primary' | 'info' | 'outline' | 'neutral'> = {
  owner: 'primary',
  admin: 'info',
  manager: 'outline',
  rep: 'neutral',
}

/** A role as a badge: the word, with a stronger fill the more the role may do. */
export function RoleBadge(props: { readonly value: Role }) {
  return <Badge variant={VARIANT[props.value]}>{ROLE_LABEL[props.value]}</Badge>
}
