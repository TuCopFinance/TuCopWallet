import { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Dimensions, StyleSheet, Text, View } from 'react-native'
import Animated, { Extrapolation, interpolate } from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import SegmentedControl from 'src/components/SegmentedControl'
import BackChevron from 'src/icons/navigation/BackChevron'
import Share from 'src/icons/actions/Share'
import Times from 'src/icons/navigation/Times'
import { TopBarIconButton } from 'src/navigator/TopBarButton'
import { useDispatch } from 'src/redux/hooks'
import { shareQRCode, SVG } from 'src/send/actions'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

type Props = MaterialTopTabBarProps & {
  qrSvgRef: React.MutableRefObject<SVG>
  leftIcon: 'times' | 'back'
  canSwitch: boolean
}

export default function QRTabBar({
  state,
  descriptors,
  navigation,
  qrSvgRef,
  leftIcon = 'times',
  canSwitch = true,
}: Props) {
  const dispatch = useDispatch()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  // Header height on iOS = safe-area top + native nav-bar (~44px)
  // + the tabHeader's own Thick24 paddingTop. Add Regular16 padding
  // between the header bottom edge and the tab bar for breathing
  // room. Fully dynamic per device instead of a magic top:100 that
  // matched no phone precisely.
  const IOS_NAV_BAR_HEIGHT = 44
  const HEADER_INNER_PADDING = 24
  const topOffset = insets.top + IOS_NAV_BAR_HEIGHT + HEADER_INNER_PADDING + Spacing.Regular16
  const values = useMemo(
    () =>
      state.routes.map((route) => {
        const { options } = descriptors[route.key]
        const label = options.title !== undefined ? options.title : route.name
        return label
      }),
    [state, descriptors]
  )

  const color = state.index === 0 ? colors.primary : colors.white
  const shareOpacity = interpolate(state.index, [0, 0.1], [1, 0], Extrapolation.CLAMP)

  const onPressClose = () => {
    navigation.getParent()?.goBack()
  }

  const onPressShare = () => {
    dispatch(shareQRCode(qrSvgRef.current))
  }

  const getParams = (route: string) => {
    return state.routes.find((data) => data.name === route)?.params ?? {}
  }

  const onChange = (value: string, index: number) => {
    const route = state.routes[index]
    const isFocused = index === state.index

    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    })

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name, getParams(route.name))
    }
  }

  return (
    <SafeAreaView style={[styles.container, { top: topOffset }]} edges={[]}>
      <View style={styles.leftContainer}>
        <TopBarIconButton
          icon={leftIcon === 'times' ? <Times color={color} /> : <BackChevron color={color} />}
          onPress={onPressClose}
        />
      </View>
      {canSwitch ? (
        <SegmentedControl values={values} selectedIndex={state.index} onChange={onChange} />
      ) : (
        <View style={styles.headerTitleContainer}>
          <Text
            testID="HeaderTitle"
            style={{
              ...styles.headerTitle,
              color: state.index === 0 ? colors.primary : colors.white,
            }}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {state.index === 0 ? t('walletAddress') : t('scanCode')}
          </Text>
        </View>
      )}
      <Animated.View
        style={[styles.rightContainer, { opacity: shareOpacity }]}
        pointerEvents={state.index > 0 ? 'none' : undefined}
      >
        <TopBarIconButton
          icon={<Share color={colors.primary} size={18} />}
          onPress={onPressShare}
        />
      </Animated.View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    // top is computed at render time from useSafeAreaInsets() so
    // this bar always lands just below the tabHeader (native
    // stack header with SendButton + QrScanButton +
    // SettingsGearButton) regardless of the device's notch size.
    // Passed inline via style={[styles.container, { top }]}.
    // NO backgroundColor here: on the Escanear tab the segmented
    // control's inactive-tab label ("Mi código") relies on the
    // dark camera preview showing through for contrast, and the
    // X close icon flips to white so it can be read on the same
    // dark background. A hardcoded white bg made both invisible.
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingTop: Spacing.Regular16,
  },
  leftContainer: {
    width: 50,
    alignItems: 'center',
  },
  rightContainer: {
    width: 50,
    alignItems: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  headerTitle: {
    ...typeScale.labelSemiBoldMedium,
    maxWidth: Dimensions.get('window').width * 0.6,
  },
})
