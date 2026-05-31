import Clipboard from '@react-native-clipboard/clipboard'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { connect } from 'react-redux'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { OnboardingEvents } from 'src/analytics/Events'
import BackupPhraseContainer, {
  BackupPhraseContainerMode,
  BackupPhraseType,
} from 'src/backup/BackupPhraseContainer'
import { useAccountKey } from 'src/backup/utils'
import Button from 'src/components/Button'
import StickyCtaBottom from 'src/components/StickyCtaBottom'
import TextButton from 'src/components/TextButton'
import Touchable from 'src/components/Touchable'
import { showToast } from 'src/components/showToast'
import CopyIcon from 'src/icons/actions/CopyIcon'
import Logo from 'src/images/Logo'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { RootState } from 'src/redux/reducers'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { vibrateInformative } from 'src/styles/hapticFeedback'
import { Spacing } from 'src/styles/styles'

interface StateProps {
  backupCompleted: boolean
}

type NavigationProps = NativeStackScreenProps<StackParamList, Screens.BackupIntroduction>

type Props = StateProps & NavigationProps

const mapStateToProps = (state: RootState): StateProps => {
  return {
    backupCompleted: state.account.backupCompleted,
  }
}

/**
 * Component displayed to the user when entering Recovery Phrase flow from the settings menu or a
 * notification. Displays content to the user depending on whether they have set up their account
 * key backup already.
 */
class BackupIntroduction extends React.Component<Props> {
  onPressBackup = () => {
    AppAnalytics.track(OnboardingEvents.backup_start)
    navigate(Screens.AccountKeyEducation)
  }

  render() {
    const { backupCompleted } = this.props

    return (
      <View style={styles.container}>
        {backupCompleted ? (
          <AccountKeyPostSetup />
        ) : (
          <AccountKeyIntro onPrimaryPress={this.onPressBackup} />
        )}
      </View>
    )
  }
}

interface AccountKeyStartProps {
  onPrimaryPress: () => void
}

/**
 * Component displayed to the user when entering Recovery Phrase flow prior to a successful completion.
 * Introduces the user to the Recovery Phrase and invites them to set it up
 */
function AccountKeyIntro({ onPrimaryPress }: AccountKeyStartProps) {
  const { t } = useTranslation()
  return (
    <ScrollView contentContainerStyle={styles.introContainer}>
      <Logo size={32} />
      <Text style={styles.h1}>{t('introBackUpPhrase')}</Text>
      <Text style={styles.body}>{t('introCompleteQuiz')}</Text>
      <Button text={t('continue')} onPress={onPrimaryPress} testID="SetUpAccountKey" />
    </ScrollView>
  )
}

/**
 * Component displayed to the user when entering the Recovery Phrase flow after having successfully set
 * up their backup. Displays their Recovery Phrase and provides an option to learn more about the
 * Recovery Phrase, which brings them to the Recovery Phrase education flow.
 */
function AccountKeyPostSetup() {
  const accountKey = useAccountKey()

  const { t } = useTranslation()

  const onPressCopy = () => {
    if (!accountKey) return
    Clipboard.setString(accountKey)
    showToast({ message: t('copied') })
    vibrateInformative()
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View testID="RecoveryPhraseContainer" style={styles.postSetupContainer}>
          <Text style={styles.postSetupTitle}>{t('postSetupTitle')}</Text>
          <BackupPhraseContainer
            value={accountKey}
            mode={BackupPhraseContainerMode.READONLY}
            type={BackupPhraseType.BACKUP_KEY}
            includeHeader={false}
          />
          <Touchable borderless onPress={onPressCopy} testID="BackupPhrase/Copy">
            <View style={styles.copyButton}>
              <CopyIcon color={colors.accent} size={20} />
              <Text style={styles.copyText}>{t('copy')}</Text>
            </View>
          </Touchable>
          <Text style={styles.postSetupBody}>{t('postSetupBody')}</Text>
        </View>
      </ScrollView>
      <StickyCtaBottom>
        <TextButton onPress={goToAccountKeyGuide} style={styles.postSetupCTA}>
          {t('postSetupCTA')}
        </TextButton>
      </StickyCtaBottom>
    </SafeAreaView>
  )
}

function goToAccountKeyGuide() {
  navigate(Screens.AccountKeyEducation, { nextScreen: Screens.BackupIntroduction })
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  introContainer: {
    flexGrow: 1,
    paddingHorizontal: Spacing.Thick24,
    justifyContent: 'center',
  },
  postSetupContainer: {
    flexGrow: 1,
    paddingTop: Spacing.Thick24,
    paddingHorizontal: Spacing.Regular16,
  },
  postSetupTitle: {
    ...typeScale.titleMedium,
    marginBottom: Spacing.Regular16,
  },
  h1: {
    ...typeScale.titleMedium,
    paddingBottom: Spacing.Regular16,
    paddingTop: Spacing.Regular16,
  },
  body: {
    ...typeScale.bodyLarge,
    paddingBottom: Spacing.Regular16,
  },
  postSetupBody: {
    ...typeScale.bodyMedium,
    marginVertical: Spacing.Regular16,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  postSetupCTA: {
    alignSelf: 'center',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: Spacing.Smallest8,
    paddingVertical: Spacing.Regular16,
  },
  copyText: {
    ...typeScale.labelSemiBoldMedium,
    color: colors.accent,
  },
})

export default connect<StateProps, {}, {}, RootState>(mapStateToProps)(BackupIntroduction)
