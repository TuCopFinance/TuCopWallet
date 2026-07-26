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
})
