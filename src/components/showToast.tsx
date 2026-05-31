import { NotificationVariant } from 'src/components/InLineNotification'

export interface ShowToastInput {
  title?: string
  message: string
  variant?: NotificationVariant
  duration?: number
}

type Listener = (input: ShowToastInput) => void

const listeners = new Set<Listener>()

export function subscribeToToasts(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function showToast(input: ShowToastInput): void {
  listeners.forEach((listener) => listener(input))
}

export function __resetToastListeners(): void {
  listeners.clear()
}
