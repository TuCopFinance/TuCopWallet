import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import BackButton from 'src/components/BackButton'
import { SettingsItemTextValue } from 'src/components/SettingsItem'
import CustomHeader from 'src/components/header/CustomHeader'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import variables from 'src/styles/variables'

const onPressContact = () => {
  navigate(Screens.SupportContact)
}

const Support = () => {
  const { t } = useTranslation()

  return (
    <SafeAreaView>
      <CustomHeader left={<BackButton />} title={t('help')} style={styles.paddingHorizontal} />
      <ScrollView>
        <SettingsItemTextValue
          testID="SupportContactLink"
          title={t('contact')}
          onPress={onPressContact}
          borderless
          showChevron
        />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  paddingHorizontal: {
    paddingHorizontal: variables.contentPadding,
  },
})

export default Support
