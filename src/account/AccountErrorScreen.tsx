import React from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import StateCard from 'src/components/StateCard'
import StickyCtaBottom from 'src/components/StickyCtaBottom'
import { Spacing } from 'src/styles/styles'

interface Props {
  title: string
  testID: string
  description: string
  onPress(): void
  buttonLabel: string
  onPressSecondary?(): void
  secondaryButtonLabel?: string | null
}

function AccountErrorScreen({
  title,
  testID,
  description,
  onPress,
  buttonLabel,
  secondaryButtonLabel,
  onPressSecondary,
}: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <StateCard variant="error" title={title} subtitle={description} testID={testID} />
      </ScrollView>
      <StickyCtaBottom>
        <Button
          onPress={onPress}
          text={buttonLabel}
          type={BtnTypes.PRIMARY}
          size={BtnSizes.FULL}
          testID={`${testID}Button`}
        />
        {!!secondaryButtonLabel && onPressSecondary && (
          <Button
            style={styles.secondaryButton}
            onPress={onPressSecondary}
            text={secondaryButtonLabel}
            type={BtnTypes.SECONDARY}
            size={BtnSizes.FULL}
            testID={`${testID}ButtonSecondary`}
          />
        )}
      </StickyCtaBottom>
    </SafeAreaView>
  )
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
  secondaryButton: {
    marginTop: Spacing.Smallest8,
  },
})

export default AccountErrorScreen
