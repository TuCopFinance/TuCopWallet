import { classifyError } from './classify'

describe('classifyError', () => {
  it('classifies "insufficient funds" as gas-insufficient', () => {
    const c = classifyError(new Error('insufficient funds for gas'))
    expect(c.kind).toBe('gas-insufficient')
    expect(c.retryable).toBe(false)
  })

  it('classifies "execution reverted: slippage" as slippage', () => {
    const c = classifyError(new Error('execution reverted: slippage'))
    expect(c.kind).toBe('slippage')
    expect(c.retryable).toBe(true)
  })

  it('classifies network errors as rpc-timeout retryable', () => {
    const c = classifyError(new Error('Network request failed'))
    expect(c.kind).toBe('rpc-timeout')
    expect(c.retryable).toBe(true)
  })

  it('classifies user-rejected pin as user-rejected non-retryable', () => {
    const c = classifyError(new Error('user rejected the request'))
    expect(c.kind).toBe('user-rejected')
    expect(c.retryable).toBe(false)
  })

  it('classifies nonce conflicts as retryable', () => {
    const c = classifyError(new Error('nonce too low'))
    expect(c.kind).toBe('nonce-conflict')
    expect(c.retryable).toBe(true)
  })

  it('falls back to unknown for unrecognized errors', () => {
    const c = classifyError(new Error('something weird'))
    expect(c.kind).toBe('unknown')
    expect(c.retryable).toBe(true)
  })

  it('preserves the raw error', () => {
    const raw = new Error('original')
    const c = classifyError(raw)
    expect(c.raw).toBe(raw)
  })

  it('handles non-Error inputs', () => {
    const c = classifyError('a string error')
    expect(c.message).toBe('a string error')
    expect(c.kind).toBe('unknown')
  })
})
