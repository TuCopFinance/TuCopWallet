import * as React from 'react'
import { WithTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import StateCard from 'src/components/StateCard'
import StickyCtaBottom from 'src/components/StickyCtaBottom'
import { withTranslation } from 'src/i18n'
import { emptyHeader } from 'src/navigator/Headers'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { navigateToAppStore, UpdateCheckResult } from 'src/utils/appUpdateChecker'

interface Props extends WithTranslation {
  updateInfo?: UpdateCheckResult
  onUpdate?: () => void
  onLater?: () => void
}

class UpgradeScreen extends React.Component<Props> {
  static navigationOptions = {
    ...emptyHeader,
  }

  handleUpdate = () => {
    const { onUpdate } = this.props
    onUpdate?.()
    navigateToAppStore()
  }

  handleLater = () => {
    const { onLater } = this.props
    onLater?.()
  }

  render() {
    const { t, updateInfo } = this.props
    const isForced = updateInfo?.isForced ?? true
    const latestVersion = updateInfo?.latestVersion
    const releaseNotes = updateInfo?.releaseNotes

    const subtitle = isForced
      ? latestVersion
        ? t('appIsOutdatedWithVersion', { version: latestVersion })
        : t('appIsOutdated')
      : latestVersion
        ? t('newVersionAvailable', { version: latestVersion })
        : t('updateAvailable')

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <StateCard variant="info" title={t('appUpdateAvailable')} subtitle={subtitle}>
            {!isForced && (
              <View style={styles.optionalContent}>
                {Boolean(releaseNotes) && (
                  <View style={styles.releaseNotesContainer}>
                    <Text style={styles.releaseNotesTitle}>{t('whatsNew')}</Text>
                    <Text style={styles.releaseNotes}>{releaseNotes}</Text>
                  </View>
                )}
                {Boolean(latestVersion) && (
                  <View style={styles.versionContainer}>
                    <Text style={styles.versionText}>
                      {t('currentVersion')}: {updateInfo?.currentVersion}
                    </Text>
                    <Text style={styles.versionText}>
                      {t('latestVersion')}: {latestVersion}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </StateCard>
        </ScrollView>
        <StickyCtaBottom>
          <Button
            text={isForced ? t('update') : t('updateNow')}
            onPress={this.handleUpdate}
            type={BtnTypes.PRIMARY}
            size={BtnSizes.FULL}
            testID="ErrorContinueButton"
          />
          {!isForced && (
            <Button
              style={styles.laterButton}
              text={t('later')}
              onPress={this.handleLater}
              type={BtnTypes.SECONDARY}
              size={BtnSizes.FULL}
              testID="UpdateLaterButton"
            />
          )}
        </StickyCtaBottom>
      </SafeAreaView>
    )
  }
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
  optionalContent: {
    marginTop: Spacing.Regular16,
    alignSelf: 'stretch',
  },
  releaseNotesContainer: {
    backgroundColor: Colors.gray1,
    borderRadius: 12,
    padding: Spacing.Regular16,
    marginBottom: Spacing.Thick24,
  },
  releaseNotesTitle: {
    ...typeScale.labelMedium,
    color: Colors.black,
    marginBottom: Spacing.Small12,
    fontWeight: '600',
  },
  releaseNotes: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    lineHeight: 20,
  },
  versionContainer: {
    backgroundColor: Colors.gray1,
    borderRadius: 8,
    padding: Spacing.Small12,
  },
  versionText: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginBottom: Spacing.Tiny4,
  },
  laterButton: {
    marginTop: Spacing.Smallest8,
  },
})

export default withTranslation<Props>()(UpgradeScreen)
