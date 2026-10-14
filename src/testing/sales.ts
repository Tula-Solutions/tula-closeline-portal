import type { RightsWording } from 'tula-closeline-contract'
import { type Handler, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

export type Role = 'owner' | 'admin' | 'manager' | 'rep'

/** Renders the portal at `url` signed in with `role` in org_1. */
export function visit(
  url: string,
  role: Role,
  handlers: Handler[],
  extra: {
    sleep?: (milliseconds: number) => Promise<void>
    rightsWording?: (version: number) => RightsWording | undefined
    strict?: boolean
  } = {}
) {
  return renderPortal({
    url,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
    ...(extra.sleep ? { sleep: extra.sleep } : {}),
    ...(extra.strict ? { strict: true } : {}),
    ...(extra.rightsWording ? { rightsWording: extra.rightsWording } : {}),
  })
}

/** A wait the test controls: every call is recorded and stays pending until `release` is called. */
export function gatedSleep() {
  const waits: number[] = []
  const gates: (() => void)[] = []
  return {
    waits,
    sleep: (milliseconds: number) =>
      new Promise<void>((resolve) => {
        waits.push(milliseconds)
        gates.push(resolve)
      }),
    release: () => gates.shift()?.(),
  }
}

/** One query parameter of a recorded URL. */
export const param = (url: string, name: string) => new URL(url, 'http://x').searchParams.get(name)
