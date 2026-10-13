/**
 * Text that came from a server or a person (a name, an email address): shown as text only, isolated
 * from the surrounding direction (`<bdi>`) and cut with an ellipsis when long. The full value is the
 * tooltip.
 */
export function Untrusted(props: { readonly value: string }) {
  return (
    <bdi className='clip' title={props.value}>
      {props.value}
    </bdi>
  )
}
