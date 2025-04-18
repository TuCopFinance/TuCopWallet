import { Platform, StyleSheet } from 'react-native'

export const Inter = {
  Regular: Platform.OS === 'android' ? 'RedHatDisplayRegular' : 'RedHatDisplay-Regular',
  Medium: Platform.OS === 'android' ? 'RedHatDisplayMedium' : 'RedHatDisplay-Medium',
  SemiBold: Platform.OS === 'android' ? 'RedHatDisplaySemiBold' : 'RedHatDisplay-SemiBold',
  Bold: Platform.OS === 'android' ? 'RedHatDisplayBold' : 'RedHatDisplay-Bold',
}

/**
 * Figma TypeScale Styles
 */
export const typeScale = StyleSheet.create({
  displayLarge: {
    fontFamily: Inter.Bold,
    fontSize: 80,
    lineHeight: 80,
    letterSpacing: -2.4,
  },
  displayMedium: {
    fontFamily: Inter.Bold,
    fontSize: 56,
    lineHeight: 64,
    letterSpacing: -1.12,
  },
  displaySmall: {
    fontFamily: Inter.Bold,
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.8,
  },
  titleLarge: {
    fontFamily: Inter.Bold,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.32,
  },
  titleMedium: {
    fontFamily: Inter.Bold,
    fontSize: 24,
    lineHeight: 32,
  },
  titleSmall: {
    fontFamily: Inter.Bold,
    fontSize: 20,
    lineHeight: 28,
  },
  titleXSmall: {
    fontFamily: Inter.Bold,
    fontSize: 16,
    lineHeight: 20,
  },
  labelSemiBoldLarge: {
    fontFamily: Inter.SemiBold,
    fontSize: 18,
    lineHeight: 28,
  },
  labelSemiBoldMedium: {
    fontFamily: Inter.SemiBold,
    fontSize: Platform.select({ android: 12, ios: 16 }),
    lineHeight: 24,
  },
  labelSemiBoldSmall: {
    fontFamily: Inter.SemiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  labelSemiBoldXSmall: {
    fontFamily: Inter.SemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  labelLarge: {
    fontFamily: Inter.Medium,
    fontSize: 18,
    lineHeight: 28,
  },
  labelMedium: {
    fontFamily: Inter.Medium,
    fontSize: Platform.select({ android: 12, ios: 16 }),
    lineHeight: 24,
  },
  labelSmall: {
    fontFamily: Inter.Medium,
    fontSize: 14,
    lineHeight: 20,
  },
  labelNormal: {
    fontFamily: Inter.Medium,
    fontSize: 16,
    lineHeight: 20,
  },
  labelXSmall: {
    fontFamily: Inter.Medium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.12,
  },
  labelXXSmall: {
    fontFamily: Inter.Medium,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.2,
  },
  bodyLarge: {
    fontFamily: Inter.Regular,
    fontSize: 18,
    lineHeight: 28,
  },
  bodyMedium: {
    fontFamily: Inter.Regular,
    fontSize: Platform.select({ android: 12, ios: 16 }),
    lineHeight: 24,
  },
  bodySmall: {
    fontFamily: Inter.Regular,
    fontSize: 14,
    lineHeight: 20,
  },
  bodyXSmall: {
    fontFamily: Inter.Regular,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.12,
  },
  bodyXXSmall: {
    fontFamily: Inter.Regular,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.2,
  },
})
