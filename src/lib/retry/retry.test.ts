import { retryWithBackoff } from './retry'

describe('retryWithBackoff', () => {
  beforeEach(() => {
    jest.useRealTimers()
  })

  afterAll(() => {
    jest.useFakeTimers()
  })

  it('returns successful result on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('ok')
    const result = await retryWithBackoff(fn, { maxAttempts: 3, baseMs: 1 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure and returns success', async () => {
    let n = 0
    const fn = jest.fn().mockImplementation(() => {
      n++
      if (n < 4) throw new Error('transient')
      return 'ok'
    })
    const result = await retryWithBackoff(fn, { maxAttempts: 5, baseMs: 1 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(4)
  })

  it('throws after maxAttempts', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('permanent'))
    await expect(retryWithBackoff(fn, { maxAttempts: 2, baseMs: 1 })).rejects.toThrow('permanent')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('honors shouldRetry returning false', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('do-not-retry'))
    await expect(
      retryWithBackoff(fn, { maxAttempts: 5, baseMs: 1, shouldRetry: () => false })
    ).rejects.toThrow('do-not-retry')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('passes attempt number to shouldRetry', async () => {
    const shouldRetry = jest.fn().mockReturnValue(true)
    const fn = jest.fn().mockRejectedValue(new Error('err'))
    try {
      await retryWithBackoff(fn, { maxAttempts: 3, baseMs: 1, shouldRetry })
    } catch {
      // expected
    }
    expect(shouldRetry.mock.calls.map((c) => c[1])).toEqual([0, 1])
  })
})
