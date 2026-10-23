/** Parses `PORTAL_DEV_ALLOWED_HOSTS` (comma-separated exact hosts) for Vite's `server.allowedHosts`. */
export function parseAllowedHosts(raw: string | undefined): string[] | undefined {
  const hosts = (raw ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host !== '')
  if (hosts.length === 0) {
    return undefined
  }
  for (const host of hosts) {
    // `true`, a wildcard or a leading-dot suffix would admit hosts nobody listed; Vite matches the
    // hostname without its port, so an entry with a port could never match.
    if (
      host.toLowerCase() === 'true' ||
      host.includes('*') ||
      host.startsWith('.') ||
      host.includes(':')
    ) {
      throw new Error(
        `PORTAL_DEV_ALLOWED_HOSTS must list exact hosts, not "${host}" (bare hostnames: no true, wildcard, suffix or port)`
      )
    }
  }
  return hosts
}
