import { useHeaderHeight } from '@react-navigation/elements'
import React, { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { GoldEvents } from 'src/analytics/Events'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { setHasSeenGoldInfo } from 'src/gold/slice'
import { useDispatch } from 'src/redux/hooks'
import Checkmark from 'src/icons/Checkmark'
import CircledIcon from 'src/icons/CircledIcon'
import GoldIconSelector from 'src/gold/GoldIconSelector'
import Lock from 'src/icons/Lock'
import { headerWithCloseButton } from 'src/navigator/Headers'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

const ICON_SIZE = 20
const ICON_BACKGROUND_CIRCLE_SIZE = 32

function DetailsItem({
  icon,
  title,
  subtitle,
}: {
  icon: ReactElement
  title: string
  subtitle: string
}) {
  return (
    <View style={styles.detailsItemContainer}>
      <CircledIcon
        backgroundColor={Colors.gray1}
        borderColor={Colors.gray2}
        radius={ICON_BACKGROUND_CIRCLE_SIZE}
      >
        {icon}
      </CircledIcon>
      <View style={styles.flex}>
        <Text style={styles.detailsItemTitle}>{title}</Text>
        <Text style={styles.detailsItemSubtitle}>{subtitle}</Text>
      </View>
    </View>
  )
}

export default function GoldInfoScreen() {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const headerHeight = useHeaderHeight()
  const { bottom } = useSafeAreaInsets()
  const insetsStyle = {
    paddingBottom: Math.max(bottom, Spacing.Regular16),
  }

  const onPressLearnMore = () => {
    AppAnalytics.track(GoldEvents.gold_info_learn_press)
    navigate(Screens.WebViewScreen, {
      uri: 'https://gold.tether.to/',
    })
  }

  const onPressGetStarted = () => {
    AppAnalytics.track(GoldEvents.gold_info_get_started_press)
    dispatch(setHasSeenGoldInfo())
    navigate(Screens.GoldHome)
  }

  return (
    <SafeAreaView style={[styles.safeAreaContainer, { paddingTop: headerHeight }]} edges={[]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.iconContainer}>
          <GoldIconSelector size={80} />
        </View>
        <Text style={styles.title} testID="GoldInfoScreen/Title">
          {t('goldFlow.info.title')}
        </Text>
        <Text style={styles.description}>{t('goldFlow.info.description')}</Text>

        <View style={styles.detailsContainer}>
          <DetailsItem
            icon={<GoldIconSelector size={ICON_SIZE} />}
            title={t('goldFlow.info.details.backed.title')}
            subtitle={t('goldFlow.info.details.backed.subtitle')}
          />
          <DetailsItem
            icon={<Checkmark width={ICON_SIZE} height={ICON_SIZE} color={Colors.black} />}
            title={t('goldFlow.info.details.secure.title')}
            subtitle={t('goldFlow.info.details.secure.subtitle')}
          />
          <DetailsItem
            icon={<Lock width={ICON_SIZE} height={ICON_SIZE} color={Colors.black} />}
            title={t('goldFlow.info.details.custody.title')}
            subtitle={t('goldFlow.info.details.custody.subtitle')}
          />
        </View>
      </ScrollView>
      <View style={[styles.buttonContainer, insetsStyle]}>
        <Button
          onPress={onPressLearnMore}
          text={t('goldFlow.info.action.learn')}
          type={BtnTypes.SECONDARY}
          size={BtnSizes.FULL}
        />
        <Button
          onPress={onPressGetStarted}
          text={t('goldFlow.info.action.getStarted')}
          type={BtnTypes.PRIMARY}
          size={BtnSizes.FULL}
          testID="GoldInfoScreen/GetStartedButton"
        />
      </View>
    </SafeAreaView>
  )
}

GoldInfoScreen.navigationOptions = () => ({
  ...headerWithCloseButton,
  headerTransparent: true,
  headerShown: true,
  headerStyle: {
    backgroundColor: 'transparent',
  },
})

const styles = StyleSheet.create({
  safeAreaContainer: {
    flex: 1,
    paddingHorizontal: Spacing.Regular16,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing.Regular16,
  },
  flex: {
    flex: 1,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: Spacing.Thick24,
    marginTop: Spacing.Regular16,
  },
  title: {
    color: Colors.black,
    textAlign: 'center',
    marginBottom: Spacing.Regular16,
    ...typeScale.titleLarge,
  },
  description: {
    color: Colors.gray4,
    textAlign: 'center',
    marginBottom: Spacing.Thick24,
    ...typeScale.bodyMedium,
  },
  detailsContainer: {
    gap: Spacing.Large32,
    marginTop: Spacing.Regular16,
  },
  detailsItemContainer: {
    flexDirection: 'row',
    gap: Spacing.Regular16,
  },
  detailsItemTitle: {
    color: Colors.black,
    ...typeScale.labelSemiBoldMedium,
  },
  detailsItemSubtitle: {
    color: Colors.gray4,
    ...typeScale.bodySmall,
    marginTop: Spacing.Tiny4,
  },
  buttonContainer: {
    gap: Spacing.Smallest8,
    marginHorizontal: Spacing.Smallest8,
  },
})
