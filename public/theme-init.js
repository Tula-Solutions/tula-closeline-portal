// Sets the theme class before the first paint so a dark page never flashes light. It is a file,
// not an inline script, because the CSP allows only `script-src 'self'`. It mirrors
// `applyTheme` in src/ui/theme.ts and reads only the stored light/dark choice.
// A signed-out visitor has no Appearance setting (`followSignIn`), and the pages that exist only
// for visitors are known by address, so on those the stored choice is ignored: no flash from a
// stale choice. Keep this list in step with src/routes/_site and src/routes/_public (a test does).
;(() => {
  const visitorPages = [
    '/sign-in',
    '/sign-up',
    '/book-a-demo',
    '/book',
    '/copilot',
    '/inbound-agent',
    '/outbound-agent',
    '/security',
    '/the-playbook',
    '/unsubscribe',
    '/consent',
  ]
  const path = location.pathname
  const visitorOnly = visitorPages.some((p) => path === p || path.startsWith(`${p}/`))
  let stored = null
  if (!visitorOnly) {
    try {
      stored = localStorage.getItem('closeline.theme')
    } catch {
      // Storage may be blocked: follow the system setting.
    }
  }
  const dark =
    stored === 'dark' ||
    (stored !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches === true)
  document.documentElement.classList.toggle('dark', dark)
})()
