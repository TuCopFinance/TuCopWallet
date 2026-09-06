import React from 'react'
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

type SpacingToken =
  | 'Tiny4'
  | 'Smallest8'
  | 'Small12'
  | 'Regular16'
  | 'Thick24'
  | 'Large32'
  | 'XLarge48'

export interface RowProps {
  children: React.ReactNode
  justify?: 'start' | 'between' | 'end' | 'center' | 'around'
  align?: 'start' | 'center' | 'end' | 'baseline'
  gap?: SpacingToken | 0
  wrap?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

// Horizontal flex row primitive. See .claude/rules/design-system.md §4.
//
// Collapses the ~296 inline `flexDirection:'row'` blocks that appear
// across the wallet. Instead of re-declaring flex + alignItems +
// justifyContent + spacing at every callsite, `<Row>` takes semantic
// props and applies them consistently.
export function Row({
  children,
  justify = 'between',
  align = 'center',
  gap = 'Small12',
  wrap = false,
  style,
  testID,
}: RowProps) {
  const justifyContent = (
    {
      start: 'flex-start',
      between: 'space-between',
      end: 'flex-end',
      center: 'center',
      around: 'space-around',
    } as const
  )[justify]

  const alignItems = (
    {
      start: 'flex-start',
      center: 'center',
      end: 'flex-end',
      baseline: 'baseline',
    } as const
  )[align]

  const gapValue = gap === 0 ? 0 : Spacing[gap]

  return (
    <View
      testID={testID}
      style={[
        styles.row,
        { justifyContent, alignItems, gap: gapValue, flexWrap: wrap ? 'wrap' : 'nowrap' },
        style,
      ]}
    >
      {children}
    </View>
  )
}

export interface LabelValueRowProps {
  label: string | React.ReactNode
  value: string | React.ReactNode
  labelStyle?: StyleProp<ViewStyle>
  valueStyle?: StyleProp<ViewStyle>
  style?: StyleProp<ViewStyle>
  testID?: string
}

// Label-left + value-right row. Same shape as LineItemRow +
// countless inline "flex row with two texts" patterns across
// confirmation/review/breakdown surfaces. See §4.
export function LabelValueRow({
  label,
  value,
  labelStyle,
  valueStyle,
  style,
  testID,
}: LabelValueRowProps) {
  return (
    <Row style={style} testID={testID} justify="between" align="center">
      {typeof label === 'string' ? (
        <Text style={[styles.label, labelStyle as any]}>{label}</Text>
      ) : (
        label
      )}
      {typeof value === 'string' ? (
        <Text style={[styles.value, valueStyle as any]}>{value}</Text>
      ) : (
        value
      )}
    </Row>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  label: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
  },
  value: {
    ...typeScale.bodyMedium,
    color: Colors.black,
  },
})

export default Row
