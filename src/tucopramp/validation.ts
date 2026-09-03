// Client-side validators + sanitizers for TuCOPRamp form fields. The server
// is always the source of truth (each POST re-validates and returns 400 with
// a specific code); these mirror the server rules so the wallet can:
//  - Disable the submit button until the input shape is plausible.
//  - Show a targeted helper text under each invalid field.
//  - Strip characters the server would reject (letters in a numeric field,
//    control chars in a name, etc.) as the user types, so paste-from-browser
//    does not sneak them through.

// --------------- length caps ---------------

// 60 chars per name field is enough for realistic Colombian first + last
// names including compound apellidos like "de la Rosa" or "Villegas Ortiz".
// Prevents accidental paste of a full paragraph.
export const MAX_NAME_LENGTH = 60

// Colombian bank account numbers are typically 10-11 digits; a few
// cooperativa / cuenta corriente formats go up to ~16. 20 is a comfortable
// upper bound that still catches obvious garbage without turning away real
// accounts.
export const MIN_ACCOUNT_NUMBER_LENGTH = 4
export const MAX_ACCOUNT_NUMBER_LENGTH = 20

// Colombian cedula is 6-10 digits (already enforced by CEDULA_REGEX in
// limits.ts). The sanitizer caps at 10 so the input cannot grow past the
// max even via paste.
export const MAX_CEDULA_LENGTH = 10

// Bre-B key spec (per placeholder text): cedula, celular, correo, or a
// personal alias starting with @. Server accepts up to 100 chars; we keep
// the same cap and validate the four allowed shapes.
export const MIN_BREB_KEY_LENGTH = 3
export const MAX_BREB_KEY_LENGTH = 100

// --------------- email ---------------

// Simple RFC-lite regex: local part with no spaces + @ + domain with a dot.
// Deliberately not the full RFC 5321 regex which is enormous and rejects
// legitimate addresses. Server does the deep validation.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 254) return false
  return EMAIL_REGEX.test(trimmed)
}

// --------------- person names ---------------

// Unicode letters (\p{L}) + space + hyphen + apostrophe. Covers compound
// names like "María-José", "d'Angelo", "Núñez", "François". Rejects
// digits, emojis, symbols, punctuation other than the three above.
const NAME_CHAR_REGEX = /^[\p{L}\s'-]+$/u

// Strips any character not allowed in a person name and truncates to
// MAX_NAME_LENGTH. Applied on every keystroke so paste from a source with
// emojis or symbols gets cleaned before the caret advances.
export function sanitizePersonName(value: string): string {
  return value.replace(/[^\p{L}\s'-]/gu, '').slice(0, MAX_NAME_LENGTH)
}

export function isValidPersonName(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) return false
  return NAME_CHAR_REGEX.test(trimmed)
}

// --------------- digits-only fields (cedula, bank account number) ---------------

// Strip non-digits and truncate. Used by cedula (max 10) and bank account
// number (max 20). Handles paste of masked / spaced numbers like
// "10.234.567-8" -> "1023456 78" -> "1023456578".
export function sanitizeDigits(value: string, max: number): string {
  return value.replace(/\D/g, '').slice(0, max)
}

export function isValidBankAccountNumber(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length < MIN_ACCOUNT_NUMBER_LENGTH || trimmed.length > MAX_ACCOUNT_NUMBER_LENGTH) {
    return false
  }
  return /^\d+$/.test(trimmed)
}

// --------------- Bre-B key ---------------

// The Bre-B directory accepts any of these 4 shapes as an alias to a
// bank account. Server re-validates and confirms the recipient before
// the transfer completes; we reject anything that does not match one of
// the four shapes so the button does not enable on garbage input.
const BREB_CEDULA_REGEX = /^\d{6,10}$/
const BREB_CELULAR_REGEX = /^(?:\+?57)?3\d{9}$/
const BREB_ALIAS_REGEX = /^@[A-Za-z0-9._-]+$/

export type BreBKeyKind = 'cedula' | 'celular' | 'email' | 'alias' | null

export function detectBreBKeyKind(value: string): BreBKeyKind {
  const trimmed = value.trim().replace(/\s+/g, '')
  if (trimmed.length === 0) return null
  if (BREB_ALIAS_REGEX.test(trimmed)) return 'alias'
  if (trimmed.includes('@')) return isValidEmail(trimmed) ? 'email' : null
  // Check celular BEFORE cedula because both are digit-only strings. In
  // Colombia every celular is 10 digits starting with 3 (optionally +57);
  // a 10-digit cedula that happens to also start with 3 is ambiguous
  // client-side (server resolves via the Bre-B directory), so we favor
  // the celular reading — the more common shape for Bre-B keys.
  if (BREB_CELULAR_REGEX.test(trimmed)) return 'celular'
  if (BREB_CEDULA_REGEX.test(trimmed)) return 'cedula'
  return null
}

export function isValidBreBKey(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length < MIN_BREB_KEY_LENGTH || trimmed.length > MAX_BREB_KEY_LENGTH) {
    return false
  }
  return detectBreBKeyKind(trimmed) !== null
}
