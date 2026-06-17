import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppState, AppStateStatus, StyleSheet, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Touchable from 'src/components/Touchable'
import { allInFlightSelector } from 'src/lib/useTransactionInFlight'
import type { InFlightDescriptor } from 'src/lib/useTransactionInFlight'
import { useSelector } from 'src/redux/hooks'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'

const MIN_AGE_MS = 60 * 1000 // 1 minute
const STALE_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

// Statuses considered unresolved (still recoverable) when surfacing the banner.
const UNRESOLVED_STATUSES: ReadonlyArray<InFlightDescriptor['status']> = [
  'idle',
  'preparing',
  'awaiting-pin',
  'submitting',
  'pending-confirmation',
  'progress',
  'partial-failure',
]

function DeepLinkRecovery() {
  const { t } = useTranslation()
  const all = useSelector(allInFlightSelector)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') refresh()
    })
    return () => sub.remove()
  }, [])

  const candidates = Object.values(all).filter(
    (flow) => UNRESOLVED_STATUSES.includes(flow.status) && now - flow.startedAt >= MIN_AGE_MS
  )

  if (candidates.length === 0) {
    return null
  }

  // Surface the oldest unresolved flow first. If the user has multiple, the
  // recovery screen (linked from this banner) will list all of them.
  const oldest = candidates.reduce((a, b) => (a.startedAt < b.startedAt ? a : b))
  const isStale = now - oldest.startedAt >= STALE_AGE_MS
  const messageKey = isStale ? 'recovery.staleBanner' : 'recovery.banner'

  const onPress = () => {
    // Recovery screen wiring lands in a follow-up. The banner is intentionally
    // non-blocking and a no-op for now so the surface ships behind the
    // existing in-flight selectors without coupling to a placeholder route.
  }

  return (
    <SafeAreaView
      style={[styles.container, isStale ? styles.containerStale : styles.containerStandard]}
      edges={['top']}
      testID="DeepLinkRecovery"
    >
      <Touchable onPress={onPress} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
        <Text style={styles.text} numberOfLines={2}>
          {t(messageKey)}
        </Text>
      </Touchable>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
  },
  containerStandard: {
    backgroundColor: colors.warningDark,
  },
  containerStale: {
    backgroundColor: colors.errorDark,
  },
  text: {
    ...typeScale.labelXSmall,
    color: colors.white,
    textAlign: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
})

export default DeepLinkRecovery
