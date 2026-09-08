// Operational caps + document validation for the TuCOPRamp integration.
//
// The server is the source of truth for both. `GET /v1/p2p/limits` is
// fetched at boot by fetchLimitsSaga and persisted in the tucopramp Redux
// slice with a 12h TTL; getCachedLimits() reads that. Document validation
// mirrors Ramp's 2026-09-08 multi-document spec (see below) so the wallet
// can disable the submit button and surface a targeted helper before the
// round-trip — the server re-validates on every POST/PATCH.

import { store } from 'src/redux/store'
import { limitsSelector } from 'src/tucopramp/selectors'
import type { TucopRampLimits } from 'src/tucopramp/types'

export const TUCOPRAMP_HARDCODED_LIMITS: TucopRampLimits = {
  min_order_cop: 100_000,
  max_order_cop: 500_000,
  max_daily_cop: 1_000_000,
  max_monthly_cop: 3_000_000,
}

// Preferred lookup. Reads the persisted slice value; on cold cache falls back
// to the hardcoded default so the UI never renders `undefined` limits.
export function getCachedLimits(): TucopRampLimits {
  const state = store.getState()
  return limitsSelector(state) ?? TUCOPRAMP_HARDCODED_LIMITS
}

// --------------- document types (multi-doc support, 2026-09-08) ---------------
//
// Ramp expanded identity from CC-only to 6 document types. Server still stores
// the value under the `cedula` wire field for backwards compat; the tuple
// (document_type, cedula) is the actual identity. document_type is OPTIONAL
// in every P2P endpoint that accepts a document; server defaults to `CC` when
// omitted. Server also lowered cedula.minLength from 6 to 1 so pre-reform
// old CC values (4-5 digits) stop 400ing at the door.
//
// Historic FIX: the old client-side rule (`^\d{6,10}$`) rejected legit old
// cedulas issued before the 6-digit reform. `isValidDocument('CC', '4321')`
// now returns true, matching the server.

export type DocumentType = 'CC' | 'CE' | 'TI' | 'NUIP' | 'NIT' | 'PAS'

export const DOCUMENT_TYPES: readonly DocumentType[] = [
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
interface DocumentSpec {
  regex: RegExp
  // Which sanitizer to apply on every keystroke.
  sanitize: (raw: string) => string
  // Native keyboardType hint for the TextInput. NIT + PAS need to allow
  // non-digit characters (hyphen or letters); the rest are pure numeric.
  keyboardType: 'numeric' | 'default'
  // Auto-capitalize hint. PAS values are usually printed uppercase on
  // passports; the rest are digits-only where autoCapitalize is a no-op.
  autoCapitalize: 'none' | 'characters'
}

// Local digits-only helper. Kept inline instead of imported from validation.ts
// so limits.ts has no cross-file deps for its own doc-type logic (validation.ts
// is a UI-facing module that pulls in name / email / breb helpers the ramp
// backend consumers do not need). Two-line dup is fine here.
function digitsOnly(value: string, max: number): string {
  return value.replace(/\D/g, '').slice(0, max)
}

// NIT: digits, optionally followed by "-" + one check digit. Sanitizer
// preserves at most one hyphen in the last position and never in the middle
// (server rejects "890-903938" or "890903938-88").
function sanitizeNit(value: string): string {
  const cleaned = value.replace(/[^\d-]/g, '')
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
    sanitize: (v) => digitsOnly(v, 10),
    keyboardType: 'numeric',
    autoCapitalize: 'none',
  },
  CE: {
    regex: /^\d{1,10}$/,
    sanitize: (v) => digitsOnly(v, 10),
    keyboardType: 'numeric',
    autoCapitalize: 'none',
  },
  TI: {
    regex: /^\d{10,11}$/,
    sanitize: (v) => digitsOnly(v, 11),
    keyboardType: 'numeric',
    autoCapitalize: 'none',
  },
  NUIP: {
    regex: /^\d{10}$/,
    sanitize: (v) => digitsOnly(v, 10),
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
