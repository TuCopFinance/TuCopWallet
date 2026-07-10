import type { ErrorClass, ErrorKind } from './types'

const PATTERNS: Array<[RegExp, ErrorKind, boolean]> = [
  [/insufficient funds/i, 'gas-insufficient', false],
  [/slippage|price moved|min.{0,3}received/i, 'slippage', true],
  [/user rejected|user denied|user cancel/i, 'user-rejected', false],
  [/nonce.{0,15}(low|conflict|too low)/i, 'nonce-conflict', true],
  [/timeout|deadline|timed out/i, 'rpc-timeout', true],
  [/network request failed|fetch failed/i, 'rpc-timeout', true],
  [/execution reverted/i, 'revert', false],
]

export function classifyError(err: unknown): ErrorClass {
  const message = err instanceof Error ? err.message : String(err)
  for (const [pattern, kind, retryable] of PATTERNS) {
    if (pattern.test(message)) {
      return { kind, message, retryable, raw: err }
    }
  }
  return { kind: 'unknown', message, retryable: true, raw: err }
}
