export type ErrorSeverity = 'info' | 'warning' | 'error'

export type ErrorVariant = 'banner' | 'fullscreen' | 'inline' | 'toast' | 'alert' | 'sheet'

export interface ErrorContext {
  // Injected automatically by buildErrorContext
  appVersion: string
  buildNumber: string
  platform: 'ios' | 'android'
  osVersion: string
  language: string
  network: string
  chainId: number
  walletAddress?: string
  timestamp: string

  // Provided by the caller
  screen?: string
  action?: string
  tokenSymbol?: string

  // Extracted from the error
  errorName: string
  errorMessage: string
  errorStack?: string
  errorCause?: string
}

export interface ClassifiedError {
  publicMessageKey: string
  publicMessageFallback: string
  technical: ErrorContext
  severity: ErrorSeverity
}

export interface ErrorMessageProps {
  error: unknown
  context?: Partial<Pick<ErrorContext, 'screen' | 'action' | 'tokenSymbol' | 'walletAddress'>>
  variant: Extract<ErrorVariant, 'banner' | 'fullscreen' | 'inline'>
  onDismiss?: () => void
}

export interface ShowErrorMessageInput {
  error: unknown
  context?: ErrorMessageProps['context']
  variant: Extract<ErrorVariant, 'toast' | 'alert' | 'sheet'>
}
