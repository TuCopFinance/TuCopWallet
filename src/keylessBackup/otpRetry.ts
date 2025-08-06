import Logger from 'src/utils/Logger'

const TAG = 'keylessBackup/otpRetry'

interface RetryConfig {
  maxRetries: number
  initialDelay: number
  maxDelay: number
  backoffMultiplier: number
  timeout: number
}

export const OTP_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  timeout: 30000, // 30 seconds per attempt
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: RetryConfig = OTP_RETRY_CONFIG
): Promise<Response> {
  let lastError: Error | null = null
  let delay = config.initialDelay

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      Logger.debug(TAG, `Attempt ${attempt + 1} of ${config.maxRetries + 1} for ${url}`)

      // Create an AbortController for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), config.timeout)

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        // Check if response is successful
        if (response.ok) {
          Logger.debug(TAG, `Request successful on attempt ${attempt + 1}`)
          return response
        }

        // For 4xx errors, don't retry (client errors)
        if (response.status >= 400 && response.status < 500) {
          Logger.warn(TAG, `Client error ${response.status}, not retrying`)
          return response
        }

        // For 5xx errors, retry
        throw new Error(`Server error: ${response.status}`)
      } catch (error: any) {
        clearTimeout(timeoutId)

        // If aborted due to timeout
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${config.timeout}ms`)
        }
        throw error
      }
    } catch (error: any) {
      lastError = error
      Logger.warn(TAG, `Attempt ${attempt + 1} failed:`, error.message)

      // Don't retry on the last attempt
      if (attempt < config.maxRetries) {
        Logger.debug(TAG, `Waiting ${delay}ms before retry`)
        await new Promise((resolve) => setTimeout(resolve, delay))

        // Exponential backoff with jitter
        delay = Math.min(delay * config.backoffMultiplier + Math.random() * 1000, config.maxDelay)
      }
    }
  }

  // All retries failed
  Logger.error(TAG, `All ${config.maxRetries + 1} attempts failed`)
  throw lastError || new Error('All retry attempts failed')
}

export function validatePhoneNumber(phoneNumber: string): boolean {
  // E.164 format validation: + followed by 1-15 digits
  const e164Regex = /^\+[1-9]\d{1,14}$/

  if (!e164Regex.test(phoneNumber)) {
    Logger.warn(TAG, `Invalid phone number format: ${phoneNumber}`)
    return false
  }

  return true
}

export async function checkServiceHealth(url: string): Promise<boolean> {
  try {
    const healthUrl = new URL(url)
    healthUrl.pathname = '/health'

    const response = await fetch(healthUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    return response.ok
  } catch (error) {
    Logger.warn(TAG, 'Service health check failed:', error)
    return false
  }
}
