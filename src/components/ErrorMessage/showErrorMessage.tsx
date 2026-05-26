import { ShowErrorMessageInput, ClassifiedError } from 'src/components/ErrorMessage/types'
import { classifyError } from 'src/utils/errors'
import Logger from 'src/utils/Logger'

const TAG = 'components/showErrorMessage'

type Listener = (input: {
  classified: ClassifiedError
  variant: ShowErrorMessageInput['variant']
}) => void

const listeners = new Set<Listener>()

export function subscribeToErrorMessages(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function showErrorMessage(input: ShowErrorMessageInput): void {
  const classified = classifyError(input.error, input.context)
  Logger.warn(TAG, `[${input.variant}] ${classified.publicMessageFallback}`, classified.technical)

  if (listeners.size === 0) {
    Logger.debug(
      TAG,
      'No listener registered. ErrorSheetHost is wired in PR 4 (sweep-error-surfaces).'
    )
  }

  listeners.forEach((listener) => listener({ classified, variant: input.variant }))
}

// Exported for test cleanup only
export function __resetActiveSheet(): void {
  listeners.clear()
}
