import React, { ReactNode } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import Celebration from 'src/icons/misc/Celebration'
import ErrorIcon from 'src/icons/status/Error'
import InfoIcon from 'src/icons/status/InfoIcon'
import Warning from 'src/icons/status/Warning'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { getShadowStyle, Shadow, Spacing } from 'src/styles/styles'

export type StateVariant = 'success' | 'error' | 'warning' | 'info' | 'loading'

interface Props {
  variant: StateVariant
  title: string
  subtitle?: string
  icon?: ReactNode
  children?: ReactNode
  testID?: string
}

const ICON_SIZE = 64

function defaultIcon(variant: StateVariant): ReactNode {
  switch (variant) {
    case 'success':
      return <Celebration size={ICON_SIZE} color={Colors.primary} />
    case 'error':
      return <ErrorIcon width={ICON_SIZE} color={Colors.errorDark} />
    case 'warning':
      return <Warning size={ICON_SIZE} color={Colors.warningDark} />
    case 'info':
      return <InfoIcon size={ICON_SIZE} color={Colors.infoDark} />
    case 'loading':
      return <ActivityIndicator size="large" color={Colors.primary} />
  }
}

function iconBgColor(variant: StateVariant): string {
  switch (variant) {
    case 'success':
      return Colors.successLight
    case 'error':
      return Colors.errorLight
    case 'warning':
      return Colors.warningLight
    case 'info':
      return Colors.infoLight
    case 'loading':
      return Colors.gray1
  }
}

export default function StateCard({ variant, title, subtitle, icon, children, testID }: Props) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={[styles.iconContainer, { backgroundColor: iconBgColor(variant) }]}>
        {icon ?? defaultIcon(variant)}
      </View>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.gray1,
    borderRadius: 16,
    padding: Spacing.Large32,
    alignItems: 'center',
    alignSelf: 'stretch',
    ...getShadowStyle(Shadow.Soft),
    borderWidth: 1,
    borderColor: Colors.gray2,
    marginHorizontal: Spacing.Smallest8,
    marginVertical: Spacing.Smallest8,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.Thick24,
  },
  title: {
    ...typeScale.labelLarge,
    color: Colors.black,
    textAlign: 'center',
    paddingTop: Spacing.Smallest8,
    paddingBottom: Spacing.Regular16,
  },
  subtitle: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
    textAlign: 'center',
    marginBottom: Spacing.Large32,
  },
})
