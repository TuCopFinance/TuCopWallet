import { BottomSheetModal } from '@gorhom/bottom-sheet'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { BottomSheetView } from '@gorhom/bottom-sheet'
import { BottomSheetBackdrop } from '@gorhom/bottom-sheet'
import type { BottomSheetDefaultBackdropProps } from '@gorhom/bottom-sheet/lib/typescript/components/bottomSheetBackdrop/types'
import ErrorSheet from 'src/components/ErrorMessage/ErrorSheet'
import { subscribeToErrorMessages } from 'src/components/ErrorMessage/showErrorMessage'
import { ClassifiedError } from 'src/components/ErrorMessage/types'

interface QueuedSheet {
  classified: ClassifiedError
}

export default function ErrorSheetHost() {
  const sheetRef = useRef<BottomSheetModal>(null)
  const [active, setActive] = useState<QueuedSheet | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeToErrorMessages(({ classified, variant }) => {
      // 'sheet' and 'alert' both open the bottom-sheet host.
      // 'toast' has its own surface (AlertBanner / SmartTopAlert).
      if (variant === 'sheet' || variant === 'alert') {
        setActive({ classified })
        sheetRef.current?.present()
      }
    })
    return unsubscribe
  }, [])

  const renderBackdrop = useCallback(
    (props: BottomSheetDefaultBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    []
  )

  const handleDismiss = () => {
    setActive(null)
  }

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onDismiss={handleDismiss}
    >
      <BottomSheetView>{active && <ErrorSheet classified={active.classified} />}</BottomSheetView>
    </BottomSheetModal>
  )
}
