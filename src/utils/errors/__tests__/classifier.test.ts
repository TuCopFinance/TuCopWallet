import { classifyError } from 'src/utils/errors/classifier'

jest.mock('src/utils/errors/context', () => ({
  buildErrorContext: ({ error, partial }: any) => ({
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorMessage: error instanceof Error ? error.message : String(error),
    errorStack: error instanceof Error ? error.stack : undefined,
    appVersion: '1.118.3',
    buildNumber: '253',
    platform: 'android',
    osVersion: '14',
    language: 'es-419',
    network: 'celo-mainnet',
    chainId: 42220,
    timestamp: '2026-05-24T00:00:00.000Z',
    screen: partial?.screen,
    action: partial?.action,
    tokenSymbol: partial?.tokenSymbol,
  }),
}))

describe('classifyError', () => {
  it('classifies not-enough-balance-for-gas as INSUFFICIENT_GAS', () => {
    const c = classifyError(new Error('not-enough-balance-for-gas'))
    expect(c.publicMessageKey).toBe('errors.public.insufficient_gas')
    expect(c.severity).toBe('warning')
  })

  it('classifies not-enough-balance-for-amount as INSUFFICIENT_BALANCE', () => {
    const c = classifyError(new Error('not-enough-balance-for-amount'))
    expect(c.publicMessageKey).toBe('errors.public.insufficient_balance')
  })

  it('classifies user-rejected (code 4001) as USER_REJECTED with severity info', () => {
    const err: any = new Error('user rejected the request')
    err.code = 4001
    const c = classifyError(err)
    expect(c.publicMessageKey).toBe('errors.public.user_rejected')
    expect(c.severity).toBe('info')
  })

  it('classifies user-rejected by message text', () => {
    const c = classifyError(new Error('User rejected signature'))
    expect(c.publicMessageKey).toBe('errors.public.user_rejected')
  })

  it('classifies NetworkError as NETWORK_ERROR', () => {
    const err = new Error('Network request failed')
    err.name = 'NetworkError'
    const c = classifyError(err)
    expect(c.publicMessageKey).toBe('errors.public.network_error')
  })

  it('classifies fetch failure as NETWORK_ERROR', () => {
    const c = classifyError(new Error('fetch failed'))
    expect(c.publicMessageKey).toBe('errors.public.network_error')
  })

  it('classifies RPC timeout as RPC_TIMEOUT', () => {
    const c = classifyError(new Error('Request timeout: HTTP 504'))
    expect(c.publicMessageKey).toBe('errors.public.rpc_timeout')
  })

  it('classifies contract revert as CONTRACT_REVERT', () => {
    const err = new Error('execution reverted')
    err.name = 'ContractFunctionRevertedError'
    const c = classifyError(err)
    expect(c.publicMessageKey).toBe('errors.public.contract_revert')
  })

  it('classifies signing failure as SIGNING_FAILED', () => {
    const err = new Error('signing failed')
    err.name = 'SignatureError'
    const c = classifyError(err)
    expect(c.publicMessageKey).toBe('errors.public.signing_failed')
  })

  it('classifies invalid address as INVALID_ADDRESS', () => {
    const err = new Error('invalid address')
    err.name = 'InvalidAddressError'
    const c = classifyError(err)
    expect(c.publicMessageKey).toBe('errors.public.invalid_address')
  })

  it('classifies swap slippage as SLIPPAGE_EXCEEDED', () => {
    const c = classifyError(new Error('slippage exceeded'))
    expect(c.publicMessageKey).toBe('errors.public.slippage_exceeded')
  })

  it('falls back to GENERIC for unknown errors', () => {
    const c = classifyError(new Error('something totally unexpected'))
    expect(c.publicMessageKey).toBe('errors.public.generic')
    expect(c.severity).toBe('error')
  })

  it('attaches partial context to the technical payload', () => {
    const c = classifyError(new Error('boom'), {
      screen: 'SendConfirmation',
      action: 'sendTransaction',
    })
    expect(c.technical.screen).toBe('SendConfirmation')
    expect(c.technical.action).toBe('sendTransaction')
  })
})
