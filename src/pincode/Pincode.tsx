/**
 * This is a VIEW. We use it everwhere we need to show PIN pad
 * with an input, e.g. get/ensure/set pincode.
 */
import React, { useEffect } from 'react'
import { Keyboard, StyleSheet, Text, View } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'
import NumberKeypad from 'src/components/NumberKeypad'
import { PIN_LENGTH } from 'src/pincode/authentication'
import PincodeDisplay from 'src/pincode/PincodeDisplay'
import { default as colors, default as Colors } from 'src/styles/colors'
import { Inter, typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import CenteredLogo from './centered-logo.svg'
import Title from './title.svg'

interface Props {
  title?: string | null // shown as H1
  subtitle?: string | null // shown as regular text
  errorText?: string | null
  maxLength?: number
  pin: string
  onChangePin: (pin: string) => void
  onCompletePin: (pin: string) => void
}

function Pincode({
  title,
  subtitle,
  errorText,
  maxLength = PIN_LENGTH,
  pin,
  onChangePin,
  onCompletePin,
}: Props) {
  const onDigitPress = (digit: number) => {
    if (pin.length >= maxLength) {
      return
    }

    const newPin = pin + digit
    onChangePin(newPin)
  }

  const onBackspacePress = () => {
    onChangePin(pin.substring(0, pin.length - 1))
  }

  useEffect(() => {
    // Wait for next frame so we the user can see the last digit
    // displayed before acting on it
    if (pin.length === maxLength) {
      requestAnimationFrame(() => onCompletePin(pin))
    }
  }, [pin])

  useEffect(() => {
    Keyboard.dismiss()
  }, [])

  return (
    <View style={styles.container}>
      <CenteredLogo style={styles.logo} />
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Title style={styles.logo} />
        {title ? <Text style={styles.title}>{title}</Text> : ''}
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.pincodeContainer}>
          <PincodeDisplay pin={pin} maxLength={maxLength} />
        </View>
        {errorText ? <Text style={styles.error}>{errorText || ''}</Text> : ''}
        <View style={styles.spacer} />
        <NumberKeypad onDigitPress={onDigitPress} onBackspacePress={onBackspacePress} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  spacer: {
    flex: 1,
  },
  error: {
    ...typeScale.labelMedium,
    color: colors.error,
    textAlign: 'center',
    marginBottom: Spacing.Thick24,
  },
  logo: {
    marginBottom: Spacing.Large32,
    alignSelf: 'center',
  },
  pincodeContainer: {
    marginVertical: 48,
    paddingHorizontal: '15%',
    alignItems: 'center',
  },
  subtitle: {
    fontFamily: Inter.Regular,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.16,
    textAlign: 'center',
    color: Colors.primary,
  },
  title: {
    fontFamily: Inter.Bold,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.16,
    textAlign: 'center',
    marginBottom: Spacing.Regular16,
    color: Colors.primary,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    marginHorizontal: Spacing.Thick24,
  },
})

export default Pincode
