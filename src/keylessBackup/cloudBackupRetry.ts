import Logger from 'src/utils/Logger'

const TAG = 'keylessBackup/cloudBackupRetry'

interface CloudBackupRetryConfig {
  maxRetries: number
  initialDelay: number
  maxDelay: number
  backoffMultiplier: number
}

export const CLOUD_BACKUP_RETRY_CONFIG: CloudBackupRetryConfig = {
  maxRetries: 3,
  initialDelay: 2000, // 2 seconds
  maxDelay: 15000, // 15 seconds
  backoffMultiplier: 2,
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  operationName: string,
  config: CloudBackupRetryConfig = CLOUD_BACKUP_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | null = null
  let delay = config.initialDelay

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      Logger.debug(TAG, `Attempt ${attempt + 1} of ${config.maxRetries + 1} for ${operationName}`)

      const result = await operation()

      Logger.debug(TAG, `${operationName} successful on attempt ${attempt + 1}`)
      return result
    } catch (error: any) {
      lastError = error
      Logger.warn(TAG, `${operationName} attempt ${attempt + 1} failed:`, error.message)

      // Don't retry on 404 (not found) or 401 (unauthorized)
      if (error.message?.includes('404') || error.message?.includes('401')) {
        throw error
      }

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
  Logger.error(TAG, `All ${config.maxRetries + 1} attempts failed for ${operationName}`)
  throw lastError || new Error(`All retry attempts failed for ${operationName}`)
}

export async function validateBackupData(encryptedMnemonic: string): Promise<boolean> {
  if (!encryptedMnemonic || typeof encryptedMnemonic !== 'string') {
    Logger.error(TAG, 'Invalid encrypted mnemonic: empty or not a string')
    return false
  }

  // Basic validation - encrypted mnemonic should be a non-empty string
  // and typically base64 encoded or hex string
  if (encryptedMnemonic.length < 32) {
    Logger.error(TAG, 'Encrypted mnemonic too short')
    return false
  }

  return true
}
