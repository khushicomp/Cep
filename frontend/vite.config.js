import { defineConfig, loadEnv } from 'vite'
import { resolveApiUrl, productionCsp } from './src/utils/apiConfig.js'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command, mode }) => {
  const production = command === 'build'
  const env = loadEnv(mode, '.', 'VITE_')
  const apiUrl = resolveApiUrl(env.VITE_API_URL, production)
  return {
  plugins: [
    react(),
    tailwindcss(),
    ...(production ? [{ name: 'production-csp', transformIndexHtml: {
      order: 'post', handler: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: productionCsp(apiUrl) }, injectTo: 'head-prepend' }],
    } }] : []),
  ],
  }
})
