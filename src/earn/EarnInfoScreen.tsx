import { useHeaderHeight } from '@react-navigation/elements'
import React, { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { EarnEvents } from 'src/analytics/Events'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { EarnTabType } from 'src/earn/types'
import ArrowDown from 'src/icons/ArrowDown'
import CircledIcon from 'src/icons/CircledIcon'
import EarnCoins from 'src/icons/EarnCoins'
import Manage from 'src/icons/Manage'
import { headerWithCloseButton } from 'src/navigator/Headers'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { getDynamicConfigParams } from 'src/statsig'
import { DynamicConfigs } from 'src/statsig/constants'
import { StatsigDynamicConfigs } from 'src/statsig/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

const ICON_SIZE = 20
const ARROW_ICON_SIZE = 24
const ICON_BACKGROUND_CIRCLE_SIZE = 32

function DetailsItem({
  icon,
  title,
  subtitle,
  footnote,
}: {
  icon: ReactElement
  title: string
  subtitle: string
  footnote?: string
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
        {!!footnote && <Text style={styles.detailsItemFootnote}>{footnote}</Text>}
      </View>
    </View>
  )
}

export default function EarnInfoScreen() {
  const { t } = useTranslation()
  const { links } = getDynamicConfigParams(DynamicConfigs[StatsigDynamicConfigs.APP_CONFIG])

  const headerHeight = useHeaderHeight()
  const { bottom } = useSafeAreaInsets()
  const insetsStyle = {
    paddingBottom: Math.max(bottom, Spacing.Regular16),
  }

  return (
    <SafeAreaView style={[styles.safeAreaContainer, { paddingTop: headerHeight }]} edges={[]}>
      <ScrollView>
        <Text style={styles.title} testID="EarnInfoScreen/Title">
          {t('earnFlow.earnInfo.title')}
        </Text>
        <View style={styles.detailsContainer}>
          <DetailsItem
            icon={<EarnCoins size={ICON_SIZE} color={Colors.black} />}
            title={t('earnFlow.earnInfo.details.work.title')}
            subtitle={t('earnFlow.earnInfo.details.work.subtitle')}
          />
          <DetailsItem
            icon={<Manage size={ICON_SIZE} color={Colors.black} />}
            title={t('earnFlow.earnInfo.details.manage.titleV1_94')}
            subtitle={t('earnFlow.earnInfo.details.manage.subtitleV1_94')}
          />
          <DetailsItem
            icon={<ArrowDown size={ARROW_ICON_SIZE} color={Colors.black} />}
            title={t('earnFlow.earnInfo.details.access.title')}
            subtitle={t('earnFlow.earnInfo.details.access.subtitle')}
          />
        </View>
      </ScrollView>
      <View style={[styles.buttonContainer, insetsStyle]}>
        <Button
          onPress={() => {
            AppAnalytics.track(EarnEvents.earn_info_learn_press)
            navigate(Screens.WebViewScreen, { uri: links.earnStablecoinsLearnMore })
          }}
          text={t('earnFlow.earnInfo.action.learn')}
          type={BtnTypes.SECONDARY}
          size={BtnSizes.FULL}
        />
        <Button
          onPress={() => {
            AppAnalytics.track(EarnEvents.earn_info_earn_press)
            navigate(Screens.EarnHome, { activeEarnTab: EarnTabType.AllPools })
          }}
          text={t('earnFlow.earnInfo.action.earn')}
          type={BtnTypes.PRIMARY}
          size={BtnSizes.FULL}
        />
      </View>
    </SafeAreaView>
  )
}

EarnInfoScreen.navigationOptions = () => ({
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
  flex: {
    flex: 1,
  },
  title: {
    color: Colors.black,
    textAlign: 'center',
    marginBottom: Spacing.Thick24,
    ...typeScale.titleLarge,
  },
  detailsContainer: {
    gap: Spacing.Large32,
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
    color: Colors.black,
    ...typeScale.bodySmall,
  },
  detailsItemFootnote: {
    color: Colors.black,
    marginTop: Spacing.Smallest8,
    ...typeScale.bodyXSmall,
  },
  buttonContainer: {
    gap: Spacing.Smallest8,
    marginHorizontal: Spacing.Smallest8,
  },
})
