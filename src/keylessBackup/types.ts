export enum KeylessBackupFlow {
  Setup = 'setup',
  Restore = 'restore',
}

export enum KeylessBackupStatus {
  NotStarted = 'NotStarted',
  InProgress = 'InProgress',
  RestoreZeroBalance = 'RestoreZeroBalance', // only in restore flow
  Completed = 'Completed',
  Failed = 'Failed',
  NotFound = 'NotFound', // only in restore flow
}

export enum KeylessBackupDeleteStatus {
  NotStarted = 'NotStarted',
  InProgress = 'InProgress',
  Completed = 'Completed',
  Failed = 'Failed',
}

export enum KeylessBackupOrigin {
  Onboarding = 'Onboarding',
  Settings = 'Settings',
}

// Nuevos tipos para el sistema mejorado
export interface CreateKeylessBackupDto {
  encryptedMnemonic: string
  encryptionAddress: string
  token: string
  phone: string
}

export interface KeylessBackupDto {
  encryptedMnemonic?: string
  encryptionAddress?: string
  walletAddress: string
  phone?: string
  status?: KeylessBackupStatus
  flow?: KeylessBackupFlow
  origin?: KeylessBackupOrigin
  createdAt?: string
  updatedAt?: string
}

export interface LinkWalletToPhoneRequest {
  phone: string
  walletAddress: string
  keyshare: string
}

export interface KeylessBackupServiceResponse {
  success: boolean
  data?: KeylessBackupDto
  error?: string
}

export interface OtpVerificationResponse {
  keyshare: string
  sessionId: string
  verified: boolean
}

export interface KeylessBackupSession {
  id: string
  walletAddress: string
  phone: string
  expirationTime: Date
  verified: boolean
}
