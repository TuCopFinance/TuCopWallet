import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet'
import type { BottomSheetDefaultBackdropProps } from '@gorhom/bottom-sheet/lib/typescript/components/bottomSheetBackdrop/types'
import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { useDispatch, useSelector } from 'src/redux/hooks'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import {
  bootstrapAccepted,
  bootstrapDismissed,
  bootstrapSheetHidden,
} from 'src/wri/feeAdapterBootstrap/slice'
import type { AdapterSymbol } from 'src/wri/feeAdapterBootstrap/slice'

// Renders the activation sheet for the CIP-64 fee-adapter bootstrap. Listens
// on the Redux pending state set by the orchestration saga and present()s the
// BottomSheetModal when it goes visible. The Host is mounted once at the App
// root so the sheet can appear over any screen (matches the ErrorSheetHost
// pattern).
//
// The sheet is intentionally simple: a friendly title, one sentence of plain
// Spanish explaining what the activation does, an explicit "una sola vez"
// reassurance, and two buttons. No on-chain detail, no addresses, no
// adapter names. The user reads "Activar Dólares" and decides.

export default function BootstrapSheetHost() {
  const sheetRef = useRef<BottomSheetModal>(null)
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const pending = useSelector((state) => state.wriFeeAdapterBootstrap.pending)
  const bootstrapState = useSelector((state) => state.wriFeeAdapterBootstrap.byAdapter)

  // The activation is in-flight when any candidate is currently between
  // bootstrapStarted and bootstrapSucceeded/Failed. We use it to gate the
  // buttons + show a spinner instead of the activate label.
  const inFlight = useMemo(() => {
    if (!pending?.visible) return false
    return pending.candidates.some((sym: AdapterSymbol) => {
      const adapter = bootstrapState[sym]
      // started but not yet resolved: lastAttemptAt is set but bootstrapped
      // is still false AND lastError is still null AND lastSuccessAt is null.
      return (
        adapter.lastAttemptAt !== null &&
        !adapter.bootstrapped &&
        adapter.lastError === null &&
        adapter.lastSuccessAt === null
      )
    })
  }, [pending, bootstrapState])

  // Present / dismiss the modal whenever the slice toggles pending.visible.
  useEffect(() => {
    if (pending?.visible) {
      sheetRef.current?.present()
    } else {
      sheetRef.current?.dismiss()
    }
  }, [pending?.visible])

  const renderBackdrop = useCallback(
    (props: BottomSheetDefaultBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    []
  )

  const handleActivate = () => {
    if (!pending) return
    dispatch(bootstrapAccepted({ candidates: pending.candidates }))
  }

  const handleLater = () => {
    if (!pending) return
    dispatch(bootstrapDismissed({ candidates: pending.candidates }))
  }

  const handleSheetDismiss = () => {
    // Pan-down-to-close gesture path. Same as tapping "ahora no" so the 24h
    // debounce kicks in and we do not re-prompt on the next boot.
    if (!pending) return
    if (inFlight) {
      // Do not let the user swipe away mid-call; the saga is still talking to
      // the backend. The modal would re-open via the saga's bootstrapSheetHidden
      // on completion anyway, but UX is calmer if we just keep it visible.
      sheetRef.current?.present()
      return
    }
    dispatch(bootstrapDismissed({ candidates: pending.candidates }))
    // Belt-and-suspenders: also clear the visibility flag in case the saga's
    // dismiss listener races.
    dispatch(bootstrapSheetHidden())
  }

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      enablePanDownToClose={!inFlight}
      backdropComponent={renderBackdrop}
      onDismiss={handleSheetDismiss}
    >
      <BottomSheetView>
        <View style={styles.container} testID="BootstrapSheet">
          <Text style={styles.title}>{t('feeAdapterBootstrap.title')}</Text>
          <Text style={styles.body}>{t('feeAdapterBootstrap.body')}</Text>
          <Text style={styles.reassure}>{t('feeAdapterBootstrap.reassure')}</Text>
          <View style={styles.buttons}>
            <Button
              type={BtnTypes.PRIMARY}
              size={BtnSizes.FULL}
              onPress={handleActivate}
              text={
                inFlight ? (
                  <ActivityIndicator color={colors.white} testID="BootstrapSheet/Spinner" />
                ) : (
                  t('feeAdapterBootstrap.activate')
                )
              }
              disabled={inFlight}
              testID="BootstrapSheet/Activate"
            />
            <Button
              type={BtnTypes.SECONDARY}
              size={BtnSizes.FULL}
              onPress={handleLater}
              text={t('feeAdapterBootstrap.later')}
              disabled={inFlight}
              testID="BootstrapSheet/Later"
            />
          </View>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.Thick24,
    paddingTop: Spacing.Regular16,
    paddingBottom: Spacing.Large32,
    gap: Spacing.Regular16,
  },
  title: {
    ...typeScale.titleSmall,
  },
  body: {
    ...typeScale.bodyMedium,
    color: colors.gray4,
  },
  reassure: {
    ...typeScale.labelSemiBoldSmall,
    color: colors.gray4,
  },
  buttons: {
    gap: Spacing.Smallest8,
    marginTop: Spacing.Regular16,
  },
})
