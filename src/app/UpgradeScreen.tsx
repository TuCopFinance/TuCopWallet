import * as React from 'react'
import { WithTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import Button, { BtnTypes } from 'src/components/Button'
import FullscreenCTA from 'src/components/FullscreenCTA'
import { withTranslation } from 'src/i18n'
import { emptyHeader } from 'src/navigator/Headers'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
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

    // Si es una actualización forzada, usar el diseño original
    if (isForced) {
      return (
        <FullscreenCTA
          title={t('appUpdateAvailable')}
          subtitle={
            latestVersion
              ? t('appIsOutdatedWithVersion', { version: latestVersion })
              : t('appIsOutdated')
          }
          CTAText={t('update')}
          CTAHandler={this.handleUpdate}
        />
      )
    }

    // Para actualizaciones opcionales, mostrar un diseño más detallado
    return (
      <FullscreenCTA
        title={t('appUpdateAvailable')}
        subtitle={
          latestVersion
            ? t('newVersionAvailable', { version: latestVersion })
            : t('updateAvailable')
        }
        CTAText={t('updateNow')}
        CTAHandler={this.handleUpdate}
      >
        <View style={styles.content}>
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

          <View style={styles.laterButtonContainer}>
            <Button
              onPress={this.handleLater}
              text={t('later')}
              type={BtnTypes.SECONDARY}
              testID="UpdateLaterButton"
            />
          </View>
        </View>
      </FullscreenCTA>
    )
  }
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingVertical: 20,
  },
  releaseNotesContainer: {
    backgroundColor: Colors.gray1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  releaseNotesTitle: {
    ...typeScale.labelMedium,
    color: Colors.black,
    marginBottom: 12,
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
    padding: 12,
    marginBottom: 24,
  },
  versionText: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginBottom: 4,
  },
  laterButtonContainer: {
    marginTop: 'auto',
    alignItems: 'center',
  },
})

export default withTranslation<Props>()(UpgradeScreen)
