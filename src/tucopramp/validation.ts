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

// Legacy cap held over from the CC-only era. Kept as an export so callers
// that only bind to Cédula de Ciudadanía can still size their TextInput
// without importing the full per-type table. New callers should prefer
// MAX_DOCUMENT_LENGTH so the field grows to fit CE / TI / NUIP / NIT / PAS.
export const MAX_CEDULA_LENGTH = 10

// Bre-B key spec (per placeholder text): cedula, celular, correo, or a
// personal alias starting with @. Server accepts up to 100 chars; we keep
// the same cap and validate the four allowed shapes.
export const MIN_BREB_KEY_LENGTH = 3
export const MAX_BREB_KEY_LENGTH = 100

// --------------- document types (multi-doc support, 2026-09-08) ---------------

// Ramp expanded the identity model from CC-only to 6 document types. Server
// still stores the value under the `cedula` wire field for backwards compat;
// the tuple (document_type, cedula) is the actual identity now.
export type DocumentType = 'CC' | 'CE' | 'TI' | 'NUIP' | 'NIT' | 'PAS'

export const ALL_DOCUMENT_TYPES: readonly DocumentType[] = [
  'CC',
  'CE',
  'TI',
  'NUIP',
  'NIT',
  'PAS',
] as const

// Longest tolerated by the server (`cedula` maxLength on the openapi is 20).
// Sized to fit PAS which is the widest shape.
export const MAX_DOCUMENT_LENGTH = 20

// Per-type validation rules, direct from Ramp's 2026-09-08 spec.
// Server re-validates in every POST/PATCH; these mirror the rules so the
// wallet can disable the submit button and surface a per-type helper.
interface DocumentSpec {
  regex: RegExp
  // Which sanitizer to apply on every keystroke. digits-with-hyphen is
  // NIT-specific (accepts an optional check-digit after a hyphen), everything
  // else is either strict digits-only or alphanumeric.
  sanitize: (raw: string) => string
  // Native keyboardType hint for the TextInput. NIT + PAS need to allow
  // non-digit characters (hyphen or letters); the rest are pure numeric.
  keyboardType: 'numeric' | 'default'
  // Auto-capitalize hint. PAS values are usually printed uppercase on
  // passports; the rest are digits-only where autoCapitalize is a no-op.
  autoCapitalize: 'none' | 'characters'
}

// NIT: digits, optionally followed by "-" + one check digit. Sanitizer
// preserves at most one hyphen in the last position and never in the middle
// (server rejects "890-903938" or "890903938-88"). Truncates to 11 chars
// which fits the widest legit NIT ("123456789-0").
function sanitizeNit(value: string): string {
  // Strip everything except digits and hyphens.
  const cleaned = value.replace(/[^\d-]/g, '')
  // Find the last hyphen (if any) and keep only one check digit after it.
  const hyphenIdx = cleaned.lastIndexOf('-')
  if (hyphenIdx === -1) {
    return cleaned.slice(0, 9)
  }
  const base = cleaned.slice(0, hyphenIdx).replace(/-/g, '').slice(0, 9)
  const rest = cleaned
    .slice(hyphenIdx + 1)
    .replace(/\D/g, '')
    .slice(0, 1)
  return rest.length > 0 ? `${base}-${rest}` : base
}

// PAS: 5-20 alphanumeric, case-insensitive input but the server accepts
// mixed case. Uppercase-on-type for consistency with real passports.
function sanitizePassport(value: string): string {
  return value
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 20)
}

const DOCUMENT_SPECS: Record<DocumentType, DocumentSpec> = {
  // Historic FIX: CC minimum bumped down from 6 to 1 to accept legit old
  // cedulas issued before the 6-digit reform. Server accepts anything 1-10
  // digits under type=CC; the old client rule rejected them at the door.
  CC: {
    regex: /^\d{1,10}$/,
    sanitize: (v) => sanitizeDigits(v, 10),
    keyboardType: 'numeric',
    autoCapitalize: 'none',
  },
  CE: {
    regex: /^\d{1,10}$/,
    sanitize: (v) => sanitizeDigits(v, 10),
    keyboardType: 'numeric',
    autoCapitalize: 'none',
  },
  TI: {
    regex: /^\d{10,11}$/,
    sanitize: (v) => sanitizeDigits(v, 11),
    keyboardType: 'numeric',
    autoCapitalize: 'none',
  },
  NUIP: {
    regex: /^\d{10}$/,
    sanitize: (v) => sanitizeDigits(v, 10),
    keyboardType: 'numeric',
    autoCapitalize: 'none',
  },
  NIT: {
    regex: /^\d{9}(?:-\d)?$/,
    sanitize: sanitizeNit,
    keyboardType: 'default',
    autoCapitalize: 'none',
  },
  PAS: {
    regex: /^[A-Za-z0-9]{5,20}$/,
    sanitize: sanitizePassport,
    keyboardType: 'default',
    autoCapitalize: 'characters',
  },
}

export function isValidDocument(type: DocumentType, value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0) return false
  return DOCUMENT_SPECS[type].regex.test(trimmed)
}

export function sanitizeDocument(type: DocumentType, raw: string): string {
  return DOCUMENT_SPECS[type].sanitize(raw)
}

export function getDocumentKeyboardType(type: DocumentType): 'numeric' | 'default' {
  return DOCUMENT_SPECS[type].keyboardType
}

export function getDocumentAutoCapitalize(type: DocumentType): 'none' | 'characters' {
  return DOCUMENT_SPECS[type].autoCapitalize
}

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
