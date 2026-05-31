import React, { useEffect, useRef, useState } from 'react'
import { NotificationVariant } from 'src/components/InLineNotification'
import Toast from 'src/components/Toast'
import { ShowToastInput, subscribeToToasts } from 'src/components/showToast'

const DEFAULT_DURATION_MS = 3000

export default function ToastHost() {
  const [active, setActive] = useState<ShowToastInput | null>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearDismissTimer = () => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current)
      dismissTimer.current = null
    }
  }

  const dismiss = () => {
    clearDismissTimer()
    setActive(null)
  }

  useEffect(() => {
    const unsubscribe = subscribeToToasts((input) => {
      clearDismissTimer()
      setActive(input)
      const duration = input.duration ?? DEFAULT_DURATION_MS
      dismissTimer.current = setTimeout(() => setActive(null), duration)
    })
    return () => {
      unsubscribe()
      clearDismissTimer()
    }
  }, [])

  if (!active) {
    return null
  }

  return (
    <Toast
      showToast
      swipeable
      onDismiss={dismiss}
      variant={active.variant ?? NotificationVariant.Success}
      title={active.title}
      description={active.message}
      testID="ToastHost"
    />
  )
}
