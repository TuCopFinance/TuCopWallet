import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import variables from 'src/styles/variables'

export default function NoProvidersScreen() {
  const { t } = useTranslation()

  const handleViewAddress = () => {
    navigate(Screens.QRNavigator, {
      screen: Screens.QRCode,
    })
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🚫</Text>
        <Text style={styles.title}>Sin proveedores de recarga disponibles</Text>
        <Text style={styles.message}>
          En este momento no hay proveedores de OnRamp integrados en la app.{'\n\n'}
          Por favor, envía fondos a tu Wallet utilizando la blockchain de Celo y los tokens cCOP o USDT.{'\n\n'}
          Gracias por tu comprensión.
        </Text>
        <Button
          onPress={handleViewAddress}
          text="📥 Ver dirección para recibir"
          type={BtnTypes.PRIMARY}
          size={BtnSizes.FULL}
          style={styles.button}
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
    paddingHorizontal: variables.contentPadding,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.Regular16,
  },
  emoji: {
    fontSize: 64,
    marginBottom: Spacing.Large32,
  },
  title: {
    ...typeScale.titleMedium,
    color: Colors.black,
    textAlign: 'center',
    marginBottom: Spacing.Large32,
    fontWeight: '600',
  },
  message: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Spacing.Huge48,
  },
  button: {
    marginTop: Spacing.Large32,
  },
})