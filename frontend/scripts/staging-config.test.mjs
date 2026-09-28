import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveApiUrl, productionCsp } from '../src/utils/apiConfig.js'

test('development fallback and normalized explicit production API', () => {
  assert.equal(resolveApiUrl(), 'http://localhost:5000/api')
  assert.equal(resolveApiUrl('https://api.example.invalid/api/', true), 'https://api.example.invalid/api')
})
for (const value of [undefined, '', 'http://localhost:5000/api', 'https://localhost/api', 'https://127.0.0.1/api',
  'https://api.example.invalid', 'https://api.example.invalid/api?secret=value', 'https://api.example.invalid/api#value',
  'https://name:credential@api.example.invalid/api', '/api', 'javascript:alert(1)', 'https://*.example.invalid/api',
  ' https://api.example.invalid/api', 'https://api.example.invalid/other/../api', 'https://api.example.invalid\\api']) {
  test('production rejects unsafe or missing API configuration: ' + String(value).split(':')[0], () => {
    assert.throws(() => resolveApiUrl(value, true), /VITE_API_URL/)
  })
}
test('both clients share configuration without coupling recovery to authenticated interceptors', () => {
  for (const file of ['api.js','recoveryApi.js']) {
    const source = readFileSync(new URL('../src/services/' + file, import.meta.url), 'utf8')
    assert.match(source, /from '\.\/endpoint'/)
    assert.doesNotMatch(source, /localhost|VITE_API_URL/)
  }
  const shared = readFileSync(new URL('../src/services/endpoint.js', import.meta.url), 'utf8')
  assert.doesNotMatch(shared, /localStorage|axios|interceptors|token/)
})
test('SPA configuration routes recovery and role paths without rewriting /api', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)))
  assert.deepEqual(config.rewrites.map(r => r.source), ['/manager/:path*','/admin/:path*','/forgot-password','/setup-password','/reset-password'])
  assert.ok(config.rewrites.every(r => r.destination === '/index.html'))
  const headers = Object.fromEntries(config.headers[0].headers.map(h => [h.key,h.value]))
  assert.equal(headers['Referrer-Policy'], 'no-referrer')
  assert.equal(headers['X-Content-Type-Options'], 'nosniff')
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/)
  assert.equal(headers['X-Frame-Options'], 'DENY')
  assert.match(headers['Permissions-Policy'], /camera=\(\)/)
  assert.match(headers['Strict-Transport-Security'], /max-age=31536000/)
})
test('generated CSP allows only same-origin scripts and exact configured API connections', () => {
  const csp = productionCsp('https://api.example.invalid/api')
  assert.match(csp, /script-src 'self';/)
  assert.match(csp, /connect-src 'self' https:\/\/api.example.invalid;/)
  assert.match(csp, /style-src-attr 'unsafe-inline'/)
  assert.doesNotMatch(csp, /unsafe-eval|script-src[^;]*unsafe-inline|\*/)
  const vite = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
  assert.match(vite, /resolveApiUrl\(env.VITE_API_URL, production\)/)
  assert.match(vite, /head-prepend/)
})
