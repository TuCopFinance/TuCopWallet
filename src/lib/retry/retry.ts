export interface RetryOpts {
  maxAttempts: number
  baseMs: number
  shouldRetry?: (err: unknown, attempt: number) => boolean
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === opts.maxAttempts - 1) break
      if (opts.shouldRetry && !opts.shouldRetry(err, attempt)) throw err
      const jitter = Math.random() * opts.baseMs
      await new Promise((r) => setTimeout(r, opts.baseMs * 2 ** attempt + jitter))
    }
  }
  throw lastErr
}
