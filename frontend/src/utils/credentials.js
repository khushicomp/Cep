export const requirements = 'Use at least 15 characters and at most 72 UTF-8 bytes. Spaces and passphrases are welcome; no required character combinations.';
export function passwordError(password, confirmation) {
  if (password !== confirmation) return 'Passwords must match.';
  if ([...password].length < 15 || new TextEncoder().encode(password).length > 72 || !password.trim() || [...password].some(char => char.codePointAt(0) < 32 || char.codePointAt(0) === 127)) {
    return 'Use at least 15 characters and at most 72 UTF-8 bytes, without control characters.';
  }
  return '';
}
export function recoveryToken(fragment) {
  const token = new URLSearchParams(fragment.replace(/^#/, '')).get('token');
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : '';
}
