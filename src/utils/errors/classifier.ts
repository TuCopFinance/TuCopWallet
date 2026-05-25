import { ClassifiedError, ErrorContext } from 'src/components/ErrorMessage/types'
import { ERROR_CATALOG, GENERIC_FALLBACK } from 'src/utils/errors/catalog'
import { buildErrorContext } from 'src/utils/errors/context'

export function classifyError(
  error: unknown,
  partial?: Partial<Pick<ErrorContext, 'screen' | 'action' | 'tokenSymbol' | 'walletAddress'>>
): ClassifiedError {
  const technical = buildErrorContext({ error, partial })

  for (const matcher of ERROR_CATALOG) {
    if (matcher.test(error)) {
      return {
        publicMessageKey: matcher.publicMessageKey,
        publicMessageFallback: matcher.publicMessageFallback,
        severity: matcher.severity,
        technical,
      }
    }
  }

  return { ...GENERIC_FALLBACK, technical }
}
