import React, { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Colors from 'src/styles/colors'
import { Spacing } from 'src/styles/styles'

interface Props {
  children: ReactNode
  /** Render the divider/top border above the CTA. Default true to match the
   *  established subsidies pattern; turn off on screens where the CTA sits
   *  directly on a colored hero. */
  showDivider?: boolean
  testID?: string
}

/**
 * Wrapper for sticky-bottom CTAs. Use inside a `SafeAreaView edges={['bottom']}`
 * (or `['top','bottom']` on no-header screens) so the system inset is applied
 * once and the CTA can't end up rendered behind the gesture bar.
 */
export default function StickyCtaBottom({ children, showDivider = true, testID }: Props) {
  return (
    <View style={[styles.container, showDivider && styles.divider]} testID={testID}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.Thick24,
    paddingTop: Spacing.Regular16,
    paddingBottom: Spacing.Regular16,
    backgroundColor: Colors.white,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: Colors.gray2,
  },
})
