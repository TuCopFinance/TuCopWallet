import React from 'react'
import { ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import KeyboardAwareScrollView from 'src/components/KeyboardAwareScrollView'
import { Edge, SafeAreaView } from 'react-native-safe-area-context'
import Colors from 'src/styles/colors'
import { Spacing } from 'src/styles/styles'

type SpacingToken =
  | 'Tiny4'
  | 'Smallest8'
  | 'Small12'
  | 'Regular16'
  | 'Thick24'
  | 'Large32'
  | 'XLarge48'

export interface ScreenProps {
  children: React.ReactNode
  edges?: Edge[]
  padding?: SpacingToken | 0
  scroll?: boolean
  keyboardAware?: boolean
  background?: string
  style?: StyleProp<ViewStyle>
  contentContainerStyle?: StyleProp<ViewStyle>
  testID?: string
}

// The one screen wrapper. See .claude/rules/design-system.md §1.1.
//
// Every full-screen surface uses this component. It handles the
// SafeAreaView + horizontal padding + optional scroll + optional
// keyboard-aware behaviour so screens don't each pick a different
// combination of SafeAreaView / KeyboardAvoidingView / plain View with
// their own paddings.
export default function Screen({
  children,
  edges = ['top', 'bottom'],
  padding = 'Regular16',
  scroll = false,
  keyboardAware = false,
  background = Colors.white,
  style,
  contentContainerStyle,
  testID,
}: ScreenProps) {
  const paddingHorizontal = padding === 0 ? 0 : Spacing[padding]

  const outer: StyleProp<ViewStyle> = [styles.flex, { backgroundColor: background }, style]
  const inner: StyleProp<ViewStyle> = [{ paddingHorizontal }, contentContainerStyle]

  if (keyboardAware) {
    return (
      <SafeAreaView edges={edges} style={outer} testID={testID}>
        <KeyboardAwareScrollView
          contentContainerStyle={[styles.grow, inner]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </KeyboardAwareScrollView>
      </SafeAreaView>
    )
  }

  if (scroll) {
    return (
      <SafeAreaView edges={edges} style={outer} testID={testID}>
        <ScrollView
          contentContainerStyle={[styles.grow, inner]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={edges} style={outer} testID={testID}>
      <View style={[styles.flex, inner]}>{children}</View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  grow: {
    flexGrow: 1,
  },
})
