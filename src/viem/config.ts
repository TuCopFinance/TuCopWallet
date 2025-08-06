// Viem transport configuration with timeouts
export const VIEM_TRANSPORT_CONFIG = {
  // Transaction receipt timeout in milliseconds
  // Some devices (especially Xiaomi) may have connectivity issues
  // that cause transactions to hang indefinitely
  transactionReceiptTimeout: 120000, // 2 minutes

  // Retry configuration
  retryCount: 3,
  retryDelay: 1000, // 1 second

  // Request timeout for RPC calls
  timeout: 30000, // 30 seconds
}
