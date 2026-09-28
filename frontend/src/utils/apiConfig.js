export function resolveApiUrl(value, production = false) {
  const invalid = () => { throw new Error('VITE_API_URL must be an absolute API URL ending in /api (HTTPS and non-local in production)') }
  if (!value && !production) return 'http://localhost:5000/api'
  if (typeof value !== 'string' || value !== value.trim() || /[\\\s]/.test(value) || !/^https?:\/\/[^/?#]+\/api\/?$/.test(value)) invalid()
  let url
  try { url = new URL(value) } catch { invalid() }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
      !/^\/api\/?$/.test(url.pathname) || !/^[a-z0-9.-]+$/i.test(url.hostname) ||
      (production && (url.protocol !== 'https:' || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
        url.hostname.endsWith('.local') || !url.hostname.includes('.') || /^\d+(\.\d+){3}$/.test(url.hostname)))) invalid()
  return `${url.origin}/api`
}

export function productionCsp(apiUrl) {
  const origin = new URL(resolveApiUrl(apiUrl, true)).origin
  // React uses inline style attributes for layout. Scripts and stylesheet elements remain self-only.
  return `default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ${origin}; base-uri 'none'; form-action 'self'; object-src 'none'`
}
