import React from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import EarnGrowIcon from 'src/icons/features/EarnGrowIcon'

interface Props {
  viewStyle?: StyleProp<ViewStyle>
  testID?: string
  size?: number
}

const EarnIcon = ({ viewStyle, testID, size = 24 }: Props) => {
  return (
    <View testID={testID} style={[styles.container, viewStyle]}>
      <EarnGrowIcon size={size} testID={testID ? `${testID}/EarnIcon` : 'EarnIcon'} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
})

export default EarnIcon
