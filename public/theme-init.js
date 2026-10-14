// Sets the theme class before the first paint so a dark page never flashes light. It is a file,
// not an inline script, because the CSP allows only `script-src 'self'`. It mirrors
// `applyTheme` in src/ui/theme.ts and reads only the stored light/dark choice.
;(() => {
  let stored = null
  try {
    stored = localStorage.getItem('closeline.theme')
  } catch {
    // Storage may be blocked: follow the system setting.
  }
  const dark =
    stored === 'dark' ||
    (stored !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches === true)
  document.documentElement.classList.toggle('dark', dark)
})()
