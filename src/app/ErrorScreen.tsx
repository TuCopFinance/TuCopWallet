import { RouteProp } from '@react-navigation/native'
import * as React from 'react'
import { WithTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Button, { BtnSizes } from 'src/components/Button'
import StateCard from 'src/components/StateCard'
import StickyCtaBottom from 'src/components/StickyCtaBottom'
import { withTranslation } from 'src/i18n'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { RESTART_APP_I18N_KEY, restartApp } from 'src/utils/AppRestart'

interface OwnProps {
  errorMessage?: string
  route?: RouteProp<StackParamList, Screens.ErrorScreen>
}

type Props = OwnProps & WithTranslation

class ErrorScreen extends React.Component<Props> {
  static navigationOptions = { header: null }

  getErrorMessage = () => {
    return this.props.errorMessage || this.props.route?.params.errorMessage || 'unknown'
  }

  render() {
    const { t } = this.props
    const errorMessage = this.getErrorMessage()
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <StateCard variant="error" title={t('oops')} subtitle={t('somethingWrong')}>
            <View style={styles.detailWrapper}>
              <Text style={styles.errorMessage} numberOfLines={10} ellipsizeMode="tail">
                {t(errorMessage)}
              </Text>
            </View>
          </StateCard>
        </ScrollView>
        <StickyCtaBottom>
          <Button
            text={t(RESTART_APP_I18N_KEY)}
            onPress={restartApp}
            size={BtnSizes.FULL}
            testID="ErrorContinueButton"
          />
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
  detailWrapper: {
    marginTop: Spacing.Regular16,
    alignSelf: 'stretch',
  },
  errorMessage: {
    ...typeScale.bodyMedium,
    fontSize: 12,
    borderRadius: 12,
    backgroundColor: Colors.gray1,
    padding: Spacing.Regular16,
  },
})

export default withTranslation<Props>()(ErrorScreen)
