import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { devProxy, parseProxyTargets } from './src/api/service-routes.ts'
import { buildCsp, buildHeaders } from './src/csp.ts'
import { parseEnv } from './src/env.ts'

/** Puts the Content-Security-Policy in index.html and writes the same policy as a `_headers` file. */
function securityHeaders(raw: Record<string, string | undefined>): Plugin {
  return {
    name: 'closeline-security-headers',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: buildCsp(parseEnv(raw), { meta: true }),
          },
          injectTo: 'head-prepend' as const,
        },
      ]
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: buildHeaders(parseEnv(raw)),
      })
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const raw = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  // Dev server settings (no VITE_ prefix, so they never reach the bundle): where auth and core listen.
  const proxy =
    command === 'build'
      ? undefined
      : devProxy(
          parseProxyTargets({
            ...loadEnv(mode, process.cwd(), ['AUTH_PROXY_', 'CORE_PROXY_', 'PLAYBOOK_PROXY_']),
            ...process.env,
          })
        )
  return {
    plugins: [
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      ...(command === 'build' ? [securityHeaders(raw)] : []),
    ],
    resolve: { alias: { '~': new URL('./src', import.meta.url).pathname } },
    // Same origin: no CORS headers, from this server or the services.
    server: { proxy, cors: false },
    preview: { proxy },
    build: { chunkSizeWarningLimit: 600, outDir: 'out', sourcemap: 'hidden', assetsInlineLimit: 0 },
  }
})
