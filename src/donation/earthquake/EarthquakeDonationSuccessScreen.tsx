import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import StateCard from 'src/components/StateCard'
import StickyCtaBottom from 'src/components/StickyCtaBottom'
import { getEarthquakeDonationConfig } from 'src/donation/earthquake/config'
import { useSelector } from 'src/redux/hooks'
import { getLocalCurrencySymbol } from 'src/localCurrency/selectors'
import { noHeaderGestureDisabled } from 'src/navigator/Headers'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

// Same inline SVGs used in the donation sheet. Kept co-located so a future
// promotion to src/icons/ moves both consumers together.
const SOCIAL_ICON_SIZE = 20
function IconInstagram({ color }: { color: string }) {
  return (
    <Svg width={SOCIAL_ICON_SIZE} height={SOCIAL_ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="2" width="20" height="20" rx="5" stroke={color} strokeWidth={2} />
      <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth={2} />
      <Circle cx="17.5" cy="6.5" r="1.2" fill={color} />
    </Svg>
  )
}
function IconX({ color }: { color: string }) {
  return (
    <Svg width={SOCIAL_ICON_SIZE} height={SOCIAL_ICON_SIZE} viewBox="0 0 24 24">
      <Path
        d="M18.244 2h3.308l-7.227 8.257L22.828 21.5h-6.657l-5.215-6.817L4.988 21.5H1.678l7.729-8.831L1.254 2h6.825l4.714 6.231L18.244 2Zm-1.161 17.52h1.833L7.076 3.865H5.109l11.974 15.655Z"
        fill={color}
      />
    </Svg>
  )
}

const PESOS_FORMAT = { groupSize: 3, groupSeparator: '.', decimalSeparator: ',' } as const
function formatPesos(amount: string, symbol: string): string {
  const bn = new BigNumber(amount)
  if (!bn.isFinite()) return `${symbol}0`
  return `${symbol}${bn.toFormat(0, BigNumber.ROUND_HALF_UP, PESOS_FORMAT)}`
}

type RouteProps = NativeStackScreenProps<StackParamList, Screens.EarthquakeDonationSuccessScreen>
type Props = RouteProps

function EarthquakeDonationSuccessScreen({ route }: Props) {
  const { t } = useTranslation()
  const localSymbol = useSelector(getLocalCurrencySymbol) || '$'
  const { amountWhole } = route.params
  const config = React.useMemo(() => getEarthquakeDonationConfig(), [])

  const onFollow = (url: string) => {
    if (!url) return
    void Linking.openURL(url)
  }

  const handleContinue = () => {
    navigate(Screens.TabActivity)
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <StateCard
          variant="success"
          title={t('earthquakeDonationSuccess.title')}
          subtitle={t('earthquakeDonationSuccess.subtitle')}
        >
          <View style={styles.detailsContainer}>
            <View style={styles.logoWrapper}>
              <Image
                source={require('src/home/refi-colombia-logo.webp')}
                style={styles.logo}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            </View>

            <View style={styles.amountRow}>
              <Text style={styles.amountLabel}>{t('earthquakeDonationSuccess.amountLabel')}</Text>
              <Text style={styles.amountValue} testID="EarthquakeDonationSuccess/Amount">
                {formatPesos(amountWhole, localSymbol)}
              </Text>
            </View>

            <Text style={styles.followPrompt}>{t('earthquakeDonationSuccess.followPrompt')}</Text>

            <View style={styles.socialsRow}>
              {config.refiInstagramUrl ? (
                <Pressable
                  style={styles.socialButton}
                  onPress={() => onFollow(config.refiInstagramUrl)}
                  testID="EarthquakeDonationSuccess/FollowInstagram"
                >
                  <IconInstagram color={Colors.primary} />
                  <Text style={styles.socialButtonText}>
                    {t('earthquakeDonationSuccess.followInstagram')}
                  </Text>
                </Pressable>
              ) : null}
              {config.refiTwitterUrl ? (
                <Pressable
                  style={styles.socialButton}
                  onPress={() => onFollow(config.refiTwitterUrl)}
                  testID="EarthquakeDonationSuccess/FollowX"
                >
                  <IconX color={Colors.primary} />
                  <Text style={styles.socialButtonText}>
                    {t('earthquakeDonationSuccess.followX')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </StateCard>
      </View>

      <StickyCtaBottom>
        <Button
          size={BtnSizes.FULL}
          type={BtnTypes.PRIMARY}
          text={t('earthquakeDonationSuccess.continueCta')}
          onPress={handleContinue}
          testID="EarthquakeDonationSuccess/Continue"
        />
      </StickyCtaBottom>
    </SafeAreaView>
  )
}

EarthquakeDonationSuccessScreen.navigationOptions = () => ({
  ...noHeaderGestureDisabled,
})

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.Regular16,
  },
  detailsContainer: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: Spacing.Regular16,
    gap: Spacing.Regular16,
    marginTop: Spacing.Regular16,
  },
  logoWrapper: {
    alignItems: 'center',
  },
  logo: {
    width: 120,
    height: 48,
  },
  amountRow: {
    alignItems: 'center',
    gap: Spacing.Tiny4,
  },
  amountLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  amountValue: {
    ...typeScale.titleMedium,
    color: Colors.black,
  },
  followPrompt: {
    ...typeScale.bodySmall,
    color: Colors.gray5,
    textAlign: 'center',
    paddingHorizontal: Spacing.Small12,
  },
  socialsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.Smallest8,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.Smallest8,
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: 24,
    paddingHorizontal: Spacing.Regular16,
    paddingVertical: Spacing.Smallest8,
  },
  socialButtonText: {
    ...typeScale.labelSmall,
    color: Colors.primary,
  },
})

export default EarthquakeDonationSuccessScreen
