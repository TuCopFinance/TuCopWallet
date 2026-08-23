import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, StyleSheet, View } from 'react-native'
import * as AndroidOpenSettings from 'react-native-android-open-settings'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import StateCard from 'src/components/StateCard'
import { navigateBack } from 'src/navigator/NavigationService'
import colors from 'src/styles/colors'
import { Spacing } from 'src/styles/styles'
import { navigateToURI } from 'src/utils/linking'

// Rendered by the QR scanner when camera permission is denied. Follows
// the wallet's standard "empty / state" pattern using StateCard so the
// visual language matches every other error / info surface in the app
// (subsidies, transaction success, etc): icon + title + subtitle + full
// width primary CTA + full width secondary CTA stacked.
export default function NotAuthorizedView() {
  const { t } = useTranslation()
  const onPressSettings = useCallback(() => {
    if (Platform.OS === 'ios') {
      navigateToURI('app-settings:')
    } else if (Platform.OS === 'android') {
      AndroidOpenSettings.appDetailsSettings()
    }
  }, [])

  return (
    <View style={styles.container}>
      <StateCard
        variant="warning"
        title={t('cameraNotAuthorizedTitle')}
        subtitle={t('cameraNotAuthorizedDescription')}
        testID="NotAuthorizedView"
      >
        <View style={styles.actions}>
          <Button
            text={t('cameraSettings')}
            onPress={onPressSettings}
            type={BtnTypes.PRIMARY}
            size={BtnSizes.FULL}
            testID="NotAuthorizedView/OpenSettings"
          />
          <Button
            text={t('goBack')}
            onPress={navigateBack}
            type={BtnTypes.SECONDARY}
            size={BtnSizes.FULL}
            testID="NotAuthorizedView/GoBack"
          />
        </View>
      </StateCard>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    // Vertically centered card. Horizontal padding matches the wallet's
    // standard content padding used by Home / Wallet screens.
    justifyContent: 'center',
    paddingHorizontal: Spacing.Regular16,
  },
  actions: {
    // Full width column stack. width 100% needed inside StateCard which
    // uses alignItems: 'center' - without it the children collapse to
    // their intrinsic content width and the FULL buttons would render
    // at button-text width instead of card width.
    width: '100%',
    gap: Spacing.Small12,
  },
})
