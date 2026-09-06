import { Platform, StyleSheet } from 'react-native'

export const Inter = {
  Regular: Platform.OS === 'android' ? 'RedHatDisplayRegular' : 'RedHatDisplay-Regular',
  Medium: Platform.OS === 'android' ? 'RedHatDisplayMedium' : 'RedHatDisplay-Medium',
  SemiBold: Platform.OS === 'android' ? 'RedHatDisplaySemiBold' : 'RedHatDisplay-SemiBold',
  Bold: Platform.OS === 'android' ? 'RedHatDisplayBold' : 'RedHatDisplay-Bold',
}

// Every text style in feature code comes from `typeScale`. Font sizes are
// the SAME across iOS and Android; a prior Platform.select() branch on
// medium keys shipped 12pt on Android + 16pt on iOS for what was
// supposed to be the same style, producing a real cross-platform bug.
// Removed. See .claude/rules/design-system.md §2.
export const typeScale = StyleSheet.create({
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
    fontSize: 16,
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
    fontSize: 16,
    lineHeight: 24,
  },
  labelSmall: {
    fontFamily: Inter.Medium,
    fontSize: 14,
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
    fontSize: 16,
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
