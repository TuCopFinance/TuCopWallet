import React from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import FastImage from 'react-native-fast-image'
import EarnImage from 'src/home/earn-v2.png'

interface Props {
  viewStyle?: StyleProp<ViewStyle>
  testID?: string
  size?: number
}

const EarnIcon = ({ viewStyle, testID, size = 24 }: Props) => {
  return (
    <View testID={testID} style={[styles.container, viewStyle]}>
      <FastImage
        source={EarnImage}
        style={[
          styles.image,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
        testID={testID ? `${testID}/EarnIcon` : 'EarnIcon'}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  image: {
    position: 'relative',
    top: 0,
    left: 0,
  },
})

export default EarnIcon
