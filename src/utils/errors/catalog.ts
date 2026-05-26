import { ClassifiedError, ErrorSeverity } from 'src/components/ErrorMessage/types'

interface ErrorMatcher {
  test: (error: unknown) => boolean
  publicMessageKey: string
  publicMessageFallback: string
  severity: ErrorSeverity
}

const includes = (error: unknown, needle: string): boolean => {
  if (error instanceof Error) {
    return error.message.toLowerCase().includes(needle.toLowerCase())
  }
  if (typeof error === 'string') {
    return error.toLowerCase().includes(needle.toLowerCase())
  }
  return false
}

const hasErrorName = (error: unknown, name: string): boolean =>
  error instanceof Error && error.name === name

const hasCode = (error: unknown, code: number): boolean =>
  typeof error === 'object' && error !== null && (error as any).code === code

export const ERROR_CATALOG: ErrorMatcher[] = [
  {
    test: (e) => includes(e, 'not-enough-balance-for-amount'),
    publicMessageKey: 'errors.public.insufficient_balance',
    publicMessageFallback: 'Saldo insuficiente para esta operacion',
    severity: 'warning',
  },
  {
    test: (e) =>
      includes(e, 'not-enough-balance-for-gas') || includes(e, 'insufficient funds for gas'),
    publicMessageKey: 'errors.public.insufficient_gas',
    publicMessageFallback: 'Saldo insuficiente para la comision de red',
    severity: 'warning',
  },
  {
    test: (e) =>
      hasCode(e, 4001) ||
      includes(e, 'user rejected') ||
      includes(e, 'user denied') ||
      includes(e, 'cancelled by user'),
    publicMessageKey: 'errors.public.user_rejected',
    publicMessageFallback: 'Operacion cancelada',
    severity: 'info',
  },
  {
    test: (e) =>
      hasErrorName(e, 'NetworkError') ||
      includes(e, 'network request failed') ||
      includes(e, 'fetch failed') ||
      includes(e, 'econnrefused'),
    publicMessageKey: 'errors.public.network_error',
    publicMessageFallback: 'Sin conexion a internet',
    severity: 'warning',
  },
  {
    test: (e) =>
      includes(e, 'timeout') ||
      includes(e, 'http 504') ||
      includes(e, 'http 503') ||
      includes(e, 'http 502'),
    publicMessageKey: 'errors.public.rpc_timeout',
    publicMessageFallback: 'El servidor no responde, intenta en unos segundos',
    severity: 'warning',
  },
  {
    test: (e) =>
      hasErrorName(e, 'ContractFunctionRevertedError') ||
      includes(e, 'execution reverted') ||
      includes(e, 'contract revert'),
    publicMessageKey: 'errors.public.contract_revert',
    publicMessageFallback: 'La operacion fue rechazada por la red',
    severity: 'error',
  },
  {
    test: (e) =>
      hasErrorName(e, 'SignatureError') ||
      includes(e, 'signing failed') ||
      includes(e, 'failed to sign'),
    publicMessageKey: 'errors.public.signing_failed',
    publicMessageFallback: 'No pudimos firmar la transaccion',
    severity: 'error',
  },
  {
    test: (e) =>
      hasErrorName(e, 'InvalidAddressError') ||
      includes(e, 'invalid address') ||
      includes(e, 'invalid checksum'),
    publicMessageKey: 'errors.public.invalid_address',
    publicMessageFallback: 'Direccion invalida',
    severity: 'warning',
  },
  {
    test: (e) => includes(e, 'unknown token') || includes(e, 'unsupported token'),
    publicMessageKey: 'errors.public.unsupported_token',
    publicMessageFallback: 'Token no soportado',
    severity: 'warning',
  },
  {
    test: (e) => includes(e, 'slippage') && (includes(e, 'exceeded') || includes(e, 'too high')),
    publicMessageKey: 'errors.public.slippage_exceeded',
    publicMessageFallback: 'El precio cambio demasiado, intenta de nuevo',
    severity: 'warning',
  },
  {
    test: (e) =>
      includes(e, 'session expired') ||
      includes(e, 'token expired') ||
      includes(e, 'unauthorized') ||
      includes(e, 'http 401'),
    publicMessageKey: 'errors.public.session_expired',
    publicMessageFallback: 'Sesion expirada, vuelve a iniciar',
    severity: 'warning',
  },
  {
    test: (e) =>
      includes(e, 'permission denied') ||
      includes(e, 'camera permission') ||
      includes(e, 'contacts permission'),
    publicMessageKey: 'errors.public.permission_required',
    publicMessageFallback: 'Permisos del telefono requeridos',
    severity: 'warning',
  },
  {
    test: (e) => includes(e, 'qr') && (includes(e, 'invalid') || includes(e, 'parse')),
    publicMessageKey: 'errors.public.invalid_qr',
    publicMessageFallback: 'QR invalido',
    severity: 'warning',
  },
  {
    test: (e) =>
      includes(e, 'failed to load') || includes(e, 'could not fetch') || includes(e, 'http 500'),
    publicMessageKey: 'errors.public.load_failed',
    publicMessageFallback: 'No pudimos cargar tu informacion',
    severity: 'warning',
  },
]

export const GENERIC_FALLBACK: Omit<ClassifiedError, 'technical'> = {
  publicMessageKey: 'errors.public.generic',
  publicMessageFallback: 'Algo no salio como esperabamos',
  severity: 'error',
}
