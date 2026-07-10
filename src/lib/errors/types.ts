export type ErrorKind =
  | 'gas-insufficient'
  | 'slippage'
  | 'revert'
  | 'rpc-timeout'
  | 'user-rejected'
  | 'connectivity'
  | 'app-backgrounded'
  | 'nonce-conflict'
  | 'unknown'

export interface ErrorClass {
  kind: ErrorKind
  message: string
  retryable: boolean
  raw?: unknown
}
