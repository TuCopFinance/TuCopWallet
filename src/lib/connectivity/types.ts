export type ConnectivityType = 'wifi' | 'cellular' | 'unknown' | 'none'

export interface ConnectivityTransition {
  at: number
  isConnected: boolean
}

export interface ConnectivityState {
  isConnected: boolean
  type: ConnectivityType
  history: ConnectivityTransition[]
}
