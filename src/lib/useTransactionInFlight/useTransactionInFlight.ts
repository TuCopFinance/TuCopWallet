import { useCallback } from 'react'
import { classifyError as defaultClassifyError } from 'src/lib/errors'
import type { ErrorClass } from 'src/lib/errors'
import { useDispatch, useSelector } from 'src/redux/hooks'
import { currentInFlightForKindSelector } from './selectors'
import { inFlightAbort, inFlightAdvance, inFlightFail, inFlightRetry, inFlightStart } from './slice'
import type {
  InFlightDescriptor,
  InFlightStatus,
  RetryOptions,
  UseTransactionInFlightArgs,
  UseTransactionInFlightResult,
} from './types'

function makeFlowId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
}

export function useTransactionInFlight(
  args: UseTransactionInFlightArgs = {}
): UseTransactionInFlightResult {
  const { scopeToFlowKind, retryClassifier } = args
  const dispatch = useDispatch()

  const current = useSelector((state) =>
    scopeToFlowKind ? currentInFlightForKindSelector(state, scopeToFlowKind) : null
  )

  const start = useCallback(
    (
      descriptor: Omit<
        InFlightDescriptor,
        'flowId' | 'currentStep' | 'status' | 'retryCount' | 'startedAt'
      >
    ): string => {
      const flowId = makeFlowId(descriptor.flowKind)
      const full: InFlightDescriptor = {
        ...descriptor,
        flowId,
        currentStep: 0,
        status: 'preparing',
        retryCount: 0,
        startedAt: Date.now(),
      }
      dispatch(inFlightStart(full))
      return flowId
    },
    [dispatch]
  )

  const advance = useCallback(
    (flowId: string, toStatus: InFlightStatus, patch?: Partial<InFlightDescriptor>) => {
      dispatch(inFlightAdvance({ flowId, toStatus, patch }))
    },
    [dispatch]
  )

  const fail = useCallback(
    (flowId: string, errorClass: ErrorClass) => {
      dispatch(inFlightFail({ flowId, errorClass }))
    },
    [dispatch]
  )

  const retry = useCallback(
    (flowId: string, opts?: RetryOptions) => {
      dispatch(
        inFlightRetry({
          flowId,
          freshPreparedTransactions: opts?.freshPreparedTransactions,
          pollContextPatch: opts?.pollContextPatch,
        })
      )
    },
    [dispatch]
  )

  const abort = useCallback(
    (flowId: string) => {
      dispatch(inFlightAbort({ flowId }))
    },
    [dispatch]
  )

  const classifyError = useCallback(
    (error: unknown): ErrorClass =>
      retryClassifier ? retryClassifier(error) : defaultClassifyError(error),
    [retryClassifier]
  )

  return {
    current,
    start,
    advance,
    fail,
    retry,
    abort,
    classifyError,
  }
}
