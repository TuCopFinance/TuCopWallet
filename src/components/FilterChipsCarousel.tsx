import React from 'react'
import { ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import Touchable from 'src/components/Touchable'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

export interface FilterChip<T> {
  id: string
  name: string
  filterFn: (t: T) => boolean
  isSelected: boolean
}

interface Props<T> {
  chips: FilterChip<T>[]
  onSelectChip(chip: FilterChip<T>): void
  primaryColor: colors
  secondaryColor: colors
  style?: StyleProp<ViewStyle>
  forwardedRef?: React.RefObject<ScrollView>
}

function FilterChipsCarousel<T>({
  chips,
  onSelectChip,
  primaryColor,
  secondaryColor,
  style,
  forwardedRef,
}: Props<T>) {
  return (
    <ScrollView
      horizontal={true}
      showsHorizontalScrollIndicator={false}
      style={[styles.container, style]}
      contentContainerStyle={styles.contentContainer}
      ref={forwardedRef}
    >
      {chips.map((chip) => {
        return (
          <View
            key={chip.id}
            style={[
              styles.filterChipBackground,
              chip.isSelected
                ? { backgroundColor: primaryColor }
                : { backgroundColor: secondaryColor },
            ]}
          >
            <Touchable
              onPress={() => {
                onSelectChip(chip)
              }}
              style={styles.filterChip}
            >
              <Text
                style={[
                  styles.filterChipText,
                  chip.isSelected ? { color: secondaryColor } : { color: primaryColor },
                ]}
              >
                {chip.name}
              </Text>
            </Touchable>
          </View>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: -Spacing.Thick24,
  },
  contentContainer: {
    paddingHorizontal: Spacing.Thick24,
    gap: Spacing.Smallest8,
  },
  filterChipBackground: {
    overflow: 'hidden',
    borderRadius: 94,
  },
  filterChip: {
    minHeight: 32,
    minWidth: 42,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.Regular16,
  },
  filterChipText: {
    ...typeScale.labelXSmall,
  },
})

export default FilterChipsCarousel
