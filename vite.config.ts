import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
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
  return {
    plugins: [
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      ...(command === 'build' ? [securityHeaders(raw)] : []),
    ],
    resolve: { alias: { '~': new URL('./src', import.meta.url).pathname } },
    build: { chunkSizeWarningLimit: 600, outDir: 'out', sourcemap: 'hidden', assetsInlineLimit: 0 },
  }
})
