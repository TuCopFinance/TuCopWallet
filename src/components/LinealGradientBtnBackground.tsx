import React from 'react'
import { StyleSheet } from 'react-native'
import LinearGradient from 'react-native-linear-gradient'
import Colors from 'src/styles/colors'

const LinealGradientBtnBackground = ({ style }: any) => {
  return (
    <LinearGradient
      colors={[Colors.gradientBorderLeft, Colors.gradientBorderRight]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={StyleSheet.absoluteFill}
    />
  )
}

export default LinealGradientBtnBackground
