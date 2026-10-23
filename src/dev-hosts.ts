/** Parses `PORTAL_DEV_ALLOWED_HOSTS` (comma-separated exact hosts) for Vite's `server.allowedHosts`. */
export function parseAllowedHosts(raw: string | undefined): string[] | undefined {
  const hosts = (raw ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host !== '')
  if (hosts.length === 0) {
    return undefined
  }
  for (const host of hosts) {
    // `true`, a wildcard or a leading-dot suffix would admit hosts nobody listed.
    if (host.toLowerCase() === 'true' || host.includes('*') || host.startsWith('.')) {
      throw new Error(
        `PORTAL_DEV_ALLOWED_HOSTS must list exact hosts, not "${host}" (no true, wildcard or suffix)`
      )
    }
  }
  return hosts
}
