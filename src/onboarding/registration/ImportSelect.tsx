import { useHeaderHeight } from '@react-navigation/elements'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Shadow } from 'react-native-shadow-2'
import { cancelCreateOrRestoreAccount } from 'src/account/actions'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { OnboardingEvents } from 'src/analytics/Events'
import Touchable from 'src/components/Touchable'
import { KeylessBackupFlow, KeylessBackupOrigin } from 'src/keylessBackup/types'
import { nuxNavigationOptions } from 'src/navigator/Headers'
import { navigate, navigateClearingStack } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import TopBarTextButtonOnboarding from 'src/onboarding/TopBarTextButtonOnboarding'
import { useDispatch } from 'src/redux/hooks'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import CommentsIcon from './comments.svg'
import EnvelopeIcon from './envelope.svg'

type Props = NativeStackScreenProps<StackParamList, Screens.ImportSelect>

function ActionCard({
  title,
  description,
  icon,
  onPress,
  testID,
}: {
  title: string
  description: string
  icon: React.ReactNode
  onPress?: () => void
  testID?: string
}) {
  const { width: screenWidth } = useWindowDimensions()
  const actionsContainerWidth = screenWidth - Spacing.XLarge48

  return (
    <Shadow
      style={[
        styles.shadow,
        {
          width: actionsContainerWidth,
        },
      ]}
      distance={10}
      offset={[0, 0]}
      startColor="rgba(190, 201, 255, 0.28)"
    >
      <Touchable borderRadius={21} style={styles.touchable} onPress={onPress}>
        <View style={styles.topLine}>
          <View>{icon}</View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardDescription}>{description}</Text>
          </View>
        </View>
      </Touchable>
    </Shadow>
  )
}

export default function ImportSelect({ navigation }: Props) {
  const dispatch = useDispatch()
  const headerHeight = useHeaderHeight()
  const { t } = useTranslation()

  const handleNavigateBack = () => {
    dispatch(cancelCreateOrRestoreAccount())
    AppAnalytics.track(OnboardingEvents.restore_account_cancel)
    navigateClearingStack(Screens.Welcome)
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TopBarTextButtonOnboarding
          title={t('cancel')}
          onPress={handleNavigateBack}
          titleStyle={{ color: colors.gray5 }}
        />
      ),
      headerStyle: {
        backgroundColor: 'transparent',
      },
    })
  }, [navigation])

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView style={[headerHeight ? { marginTop: headerHeight } : undefined]}>
        <View style={styles.viewContainer}>
          <View style={styles.screenTextContainer}>
            <Text style={styles.screenTitle}>{t('importSelect.title')}</Text>
            <Text style={styles.screenDescription}>{t('importSelect.description')}</Text>
          </View>
          <ActionCard
            title={t('importSelect.emailAndPhone.title')}
            description={t('importSelect.emailAndPhone.description')}
            icon={<EnvelopeIcon />}
            onPress={() =>
              navigate(Screens.SignInWithEmail, {
                keylessBackupFlow: KeylessBackupFlow.Restore,
                origin: KeylessBackupOrigin.Onboarding,
              })
            }
            testID="ImportSelect/CloudBackup"
          />
          <ActionCard
            title={t('importSelect.recoveryPhrase.title')}
            description={t('importSelect.recoveryPhrase.description')}
            icon={<CommentsIcon />}
            onPress={() => navigate(Screens.ImportWallet, { clean: true })}
            testID="ImportSelect/Mnemonic"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

ImportSelect.navigationOptions = {
  ...nuxNavigationOptions,
  // Prevent swipe back on iOS, users have to explicitly press cancel
  gestureEnabled: false,
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: 21,
    backgroundColor: colors.white,
  },
  cardDescription: {
    ...typeScale.bodySmall,
  },
  cardTitle: {
    ...typeScale.labelSmall,
    color: colors.black,
    fontWeight: '700',
  },
  safeArea: {
    flex: 1,
  },
  screenDescription: {
    ...typeScale.bodyMedium,
    textAlign: 'left',
    marginBottom: Spacing.Thick24,
  },
  screenTitle: {
    ...typeScale.titleSmall,
    textAlign: 'left',
  },
  screenTextContainer: {
    gap: Spacing.Thick24,
  },
  topLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.Regular16,
  },
  touchable: {
    flex: 1,
    padding: Spacing.Regular16,
  },
  viewContainer: {
    alignItems: 'center',
    gap: Spacing.Thick24,
    padding: Spacing.Thick24,
  },
})
