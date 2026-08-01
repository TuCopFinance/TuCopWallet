import * as Sentry from '@sentry/react-native'
import { captureBusinessError } from 'src/sentry/captureBusinessError'
import * as config from 'src/config'

jest.mock('@sentry/react-native', () => ({
  withScope: jest.fn((fn) => fn(mockScope)),
  captureException: jest.fn(),
}))

const mockScope = {
  setTags: jest.fn(),
  setContext: jest.fn(),
  setFingerprint: jest.fn(),
}

describe('captureBusinessError', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(config as any).SENTRY_ENABLED = true
  })

  it('no-ops when Sentry is disabled', () => {
    ;(config as any).SENTRY_ENABLED = false
    captureBusinessError(new Error('x'), {
      feature: 'earn',
      provider: 'neeru',
      action: 'close_position',
    })
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('sets feature/provider/action tags and reports the error', () => {
    captureBusinessError(new Error('boom'), {
      feature: 'earn',
      provider: 'neeru',
      action: 'close_position',
      errorCode: 'LOW_POOL',
    })
    expect(mockScope.setTags).toHaveBeenCalledWith({
      feature: 'earn',
      provider: 'neeru',
      action: 'close_position',
      errorCode: 'LOW_POOL',
    })
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error))
  })

  it('omits errorCode tag when unclassified', () => {
    captureBusinessError(new Error('boom'), {
      feature: 'swap',
      provider: 'squid',
      action: 'execute',
    })
    expect(mockScope.setTags).toHaveBeenCalledWith({
      feature: 'swap',
      provider: 'squid',
      action: 'execute',
    })
  })

  it('groups the same business error via fingerprint regardless of message', () => {
    captureBusinessError(new Error('boom'), {
      feature: 'earn',
      provider: 'neeru',
      action: 'close_position',
      errorCode: 'LOW_POOL',
    })
    expect(mockScope.setFingerprint).toHaveBeenCalledWith([
      'earn',
      'neeru',
      'close_position',
      'LOW_POOL',
    ])
  })

  it('wraps non-Error thrown values so Sentry always sees a stack', () => {
    captureBusinessError('string error', {
      feature: 'transactions',
      provider: 'internal',
      action: 'send_prepared',
    })
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error))
  })

  it('attaches business extra as its own context section', () => {
    captureBusinessError(new Error('boom'), {
      feature: 'positions',
      provider: 'internal',
      action: 'trigger_shortcut',
      extra: { shortcutId: 'withdraw-amount-only', httpStatus: 502 },
    })
    expect(mockScope.setContext).toHaveBeenCalledWith('business', {
      shortcutId: 'withdraw-amount-only',
      httpStatus: 502,
    })
  })

  it('coerces a non-string errorCode object to JSON instead of [object Object]', () => {
    // Real regression: gold/saga.ts was passing classifyError(err) directly,
    // which is an ErrorClass object. String(obj) collapses to
    // "[object Object]" and every gold-buy revert landed with the same
    // useless tag. captureBusinessError must defensively JSON.stringify
    // any object it receives so the tag stays greppable.
    captureBusinessError(new Error('boom'), {
      feature: 'gold',
      provider: 'squid',
      action: 'buy_gold_execute',
      // simulating the old buggy call site that passed a whole object
      errorCode: { kind: 'revert', message: 'execution reverted', retryable: false } as any,
    })
    const tagsArg = mockScope.setTags.mock.calls[0][0]
    expect(tagsArg.errorCode).toContain('revert')
    expect(tagsArg.errorCode).not.toBe('[object Object]')
    const fingerprintArg = mockScope.setFingerprint.mock.calls[0][0]
    expect(fingerprintArg[3]).not.toBe('[object Object]')
  })

  it('coerces primitive non-string errorCodes (number, boolean) to their string form', () => {
    captureBusinessError(new Error('boom'), {
      feature: 'swap',
      provider: 'squid',
      action: 'execute',
      errorCode: 502 as any,
    })
    expect(mockScope.setTags).toHaveBeenCalledWith(expect.objectContaining({ errorCode: '502' }))
  })
})
