import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Modal from 'react-native-modal'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { WebViewEvents } from 'src/analytics/Events'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import variables from 'src/styles/variables'
import { navigateToURI } from 'src/utils/linking'

interface Props {
  currentUrl: string
  isVisible: boolean
  onClose(): void
  toggleBottomSheet(): void
}

export function WebViewAndroidBottomSheet({
  currentUrl,
  isVisible,
  onClose,
  toggleBottomSheet,
}: Props) {
  const { t } = useTranslation()
  const openExternalLink = () => {
    navigateToURI(currentUrl)
    toggleBottomSheet()
    AppAnalytics.track(WebViewEvents.webview_open_in_browser, { currentUrl })
  }

  return (
    <Modal
      isVisible={isVisible}
      animationIn="slideInUp"
      animationInTiming={400}
      swipeDirection="down"
      style={styles.overlay}
      onBackdropPress={onClose}
      onSwipeComplete={onClose}
      useNativeDriverForBackdrop={true}
    >
      <View style={styles.centerContainer} testID="WebViewAndroidBottomSheet">
        <View style={styles.handle} />
        <Pressable
          style={styles.pressable}
          onPress={openExternalLink}
          android_ripple={{ color: Colors.gray2, borderless: false }}
          testID="OpenInExternalBrowser"
        >
          <Text style={styles.bottomSheetText}>{t('webView.openExternal')}</Text>
        </Pressable>
        <Pressable 
          style={styles.pressable}
          onPress={onClose} 
          android_ripple={{ color: Colors.gray2, borderless: false }}
        >
          <Text style={styles.bottomSheetText}>{t('dismiss')}</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  centerContainer: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 8,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.gray3,
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: 12,
  },
  // Needed to add icons in the pressable buttons
  pressable: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  bottomSheetText: {
    ...typeScale.bodyMedium,
    textAlign: 'left',
    padding: variables.contentPadding,
    flex: 1,
  },
})

export default WebViewAndroidBottomSheet
