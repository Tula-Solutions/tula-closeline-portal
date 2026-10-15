import type { Role } from 'tula-closeline-contract'
import { ROLE_LABEL } from '~/data/permissions'

/** A role set as plain text, the way a ledger would write it. */
export function RoleBadge(props: { readonly value: Role }) {
  return <span className='text-sm'>{ROLE_LABEL[props.value]}</span>
}
