import React, { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import Touchable from 'src/components/Touchable'
import DownArrowIcon from 'src/icons/DownArrowIcon'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

interface Props<T> {
  options: { value: T; label: string }[]
  onValueSelected(value: T): void
  defaultLabel?: string
  testId?: string
}

/* Dropdown component with unscrollable list of options */

function Dropdown<T>(props: Props<T>) {
  const testID = props.testId ? props.testId : 'Dropdown'
  const [isOpen, setIsOpen] = useState(false)
  const [labelSelected, setLabelSelected] = useState<string | undefined>(props.defaultLabel)

  const toggleOpen = () => {
    setIsOpen((prev) => !prev)
  }

  return (
    <View testID={testID}>
      <Touchable onPress={toggleOpen} testID={testID + '-Touchable'}>
        <View style={styles.selectedOptionContainer}>
          <Text style={styles.optionText}>{labelSelected}</Text>
          {!isOpen ? (
            <DownArrowIcon color={Colors.accent} strokeWidth={2} />
          ) : (
            <DownArrowIcon
              color={Colors.accent}
              strokeWidth={2}
              style={{ transform: [{ rotate: '180deg' }] }}
            />
          )}
        </View>
      </Touchable>
      {isOpen && (
        <View style={styles.optionsWrapper}>
          <ScrollView style={styles.optionsContainer} nestedScrollEnabled>
            {props.options.map((option) => {
              return (
                <Touchable
                  style={styles.touchableOption}
                  onPress={() => {
                    setLabelSelected(option.label)
                    toggleOpen()
                    props.onValueSelected(option.value)
                  }}
                  testID={testID + '-' + option.label}
                  key={option.label}
                >
                  <Text style={styles.optionText}>{option.label}</Text>
                </Touchable>
              )
            })}
          </ScrollView>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  selectedOptionContainer: {
    padding: Spacing.Small12,
    borderColor: Colors.gray2,
    borderRadius: Spacing.Tiny4,
    borderWidth: 1,
    gap: Spacing.Thick24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionsWrapper: {
    position: 'relative',
    zIndex: 10,
  },
  optionsContainer: {
    position: 'absolute',
    top: 0,
    borderColor: Colors.gray2,
    borderRadius: Spacing.Tiny4,
    borderWidth: 1,
    backgroundColor: Colors.white,
    width: '100%',
    maxHeight: 250,
    zIndex: 10,
    elevation: 5,
  },
  optionText: {
    ...typeScale.bodyMedium,
    flexGrow: 1,
  },
  touchableOption: {
    padding: Spacing.Small12,
  },
})

export default Dropdown
