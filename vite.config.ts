import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { devProxy, parseProxyTargets } from './src/api/service-routes.ts'
import { buildCsp, buildHeaders } from './src/csp.ts'
import { parseAllowedHosts } from './src/dev-hosts.ts'
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

/** Wraps the Chat widget in a function so its names never join a host page's global scope. */
function wrapChatWidget(): Plugin {
  return {
    name: 'wrap-chat-widget',
    generateBundle(_, bundle) {
      const file = bundle['chat-widget.js']
      if (file?.type === 'chunk') {
        file.code = `(()=>{${file.code}})()\n`
      }
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
            ...loadEnv(mode, process.cwd(), [
              'AUTH_PROXY_',
              'CORE_PROXY_',
              'PLAYBOOK_PROXY_',
              'VOICE_PROXY_',
              'OUTBOUND_PROXY_',
            ]),
            ...process.env,
          })
        )
  return {
    plugins: [
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      ...(command === 'build' ? [securityHeaders(raw), wrapChatWidget()] : []),
    ],
    resolve: { alias: { '~': new URL('./src', import.meta.url).pathname } },
    // Same origin: no CORS headers, from this server or the services. `allowedHosts` adds exact
    // hosts (a tunnel) to Vite's default; unset keeps the default.
    server: {
      proxy,
      cors: false,
      allowedHosts: parseAllowedHosts(process.env.PORTAL_DEV_ALLOWED_HOSTS),
    },
    preview: { proxy },
    build: {
      chunkSizeWarningLimit: 600,
      outDir: 'out',
      sourcemap: 'hidden',
      assetsInlineLimit: 0,
      // The embeddable Chat widget is a second, self-contained entry at a fixed, unhashed address.
      rolldownOptions: {
        input: {
          index: new URL('./index.html', import.meta.url).pathname,
          'chat-widget': new URL('./src/chat-widget/entry.ts', import.meta.url).pathname,
        },
        output: {
          entryFileNames: (chunk) =>
            chunk.name === 'chat-widget' ? 'chat-widget.js' : 'assets/[name]-[hash].js',
        },
      },
    },
  }
})
