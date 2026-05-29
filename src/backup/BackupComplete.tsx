import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { backupCompletedSelector } from 'src/account/selectors'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { OnboardingEvents } from 'src/analytics/Events'
import StateCard from 'src/components/StateCard'
import Checkmark from 'src/icons/status/Checkmark'
import Colors from 'src/styles/colors'
import { navigate, navigateHome } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useSelector } from 'src/redux/hooks'
import { Spacing } from 'src/styles/styles'

const CHECK_SIZE = 64

type Props = NativeStackScreenProps<StackParamList, Screens.BackupComplete>

function BackupComplete({ route }: Props) {
  const isAccountRemoval = route.params?.isAccountRemoval ?? false
  const backupCompleted = useSelector(backupCompletedSelector)
  const { t } = useTranslation()

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAccountRemoval) {
        navigate(Screens.SecuritySubmenu, { promptConfirmRemovalModal: true })
      } else if (backupCompleted) {
        AppAnalytics.track(OnboardingEvents.backup_complete)
        navigateHome()
      } else {
        throw new Error('Backup complete screen should not be reachable without completing backup')
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  if (!backupCompleted) {
    return <SafeAreaView style={styles.container} edges={['top', 'bottom']} />
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View testID="BackupComplete">
          <StateCard
            variant="success"
            title={t('backupComplete.2')}
            icon={<Checkmark height={CHECK_SIZE} color={Colors.successDark} />}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.Regular16,
  },
})

export default BackupComplete
