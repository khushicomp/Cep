import { resolveApiUrl } from '../utils/apiConfig'
export const apiBaseUrl = resolveApiUrl(import.meta.env.VITE_API_URL, import.meta.env.PROD)
