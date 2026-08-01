import * as Sentry from '@sentry/react-native'
import { _resetCapturedUxSignalsForTests, captureUxSignalOnce } from 'src/sentry/captureUxSignal'
import * as config from 'src/config'

jest.mock('@sentry/react-native', () => ({
  withScope: jest.fn((fn) => fn(mockScope)),
  captureMessage: jest.fn(),
}))

const mockScope = {
  setLevel: jest.fn(),
  setTags: jest.fn(),
  setFingerprint: jest.fn(),
}

describe('captureUxSignalOnce', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    _resetCapturedUxSignalsForTests()
    ;(config as any).SENTRY_ENABLED = true
  })

  it('no-ops when Sentry is disabled', () => {
    ;(config as any).SENTRY_ENABLED = false
    captureUxSignalOnce('ux.chip:send:25', 'percentage_chip_tap', {
      flow: 'send',
      percentage: '25',
    })
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('fires captureMessage at level=info with tags and stable fingerprint', () => {
    captureUxSignalOnce('ux.chip:earn:50', 'percentage_chip_tap', {
      flow: 'earn',
      percentage: '50',
    })
    expect(mockScope.setLevel).toHaveBeenCalledWith('info')
    expect(mockScope.setTags).toHaveBeenCalledWith({ flow: 'earn', percentage: '50' })
    expect(mockScope.setFingerprint).toHaveBeenCalledWith(['percentage_chip_tap', 'earn', '50'])
    expect(Sentry.captureMessage).toHaveBeenCalledWith('percentage_chip_tap')
  })

  it('dedupes: same key only fires once per session', () => {
    captureUxSignalOnce('ux.chip:swap:75', 'percentage_chip_tap', {
      flow: 'swap',
      percentage: '75',
    })
    captureUxSignalOnce('ux.chip:swap:75', 'percentage_chip_tap', {
      flow: 'swap',
      percentage: '75',
    })
    captureUxSignalOnce('ux.chip:swap:75', 'percentage_chip_tap', {
      flow: 'swap',
      percentage: '75',
    })
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
  })

  it('different keys fire independently', () => {
    captureUxSignalOnce('ux.chip:send:25', 'percentage_chip_tap', {
      flow: 'send',
      percentage: '25',
    })
    captureUxSignalOnce('ux.chip:send:50', 'percentage_chip_tap', {
      flow: 'send',
      percentage: '50',
    })
    captureUxSignalOnce('ux.chip:earn:25', 'percentage_chip_tap', {
      flow: 'earn',
      percentage: '25',
    })
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(3)
  })

  it('_resetCapturedUxSignalsForTests clears the session dedupe set', () => {
    captureUxSignalOnce('ux.chip:send:100', 'percentage_chip_tap', {
      flow: 'send',
      percentage: '100',
    })
    _resetCapturedUxSignalsForTests()
    captureUxSignalOnce('ux.chip:send:100', 'percentage_chip_tap', {
      flow: 'send',
      percentage: '100',
    })
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(2)
  })
})
