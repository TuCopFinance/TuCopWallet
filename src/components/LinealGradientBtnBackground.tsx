import React from 'react'
import { StyleSheet } from 'react-native'
import LinearGradient from 'react-native-linear-gradient'

const LinealGradientBtnBackground = ({ style }: any) => {
  return (
    <LinearGradient
      colors={['#2F4ACD', '#182567']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={StyleSheet.absoluteFill}
    />
  )
}

export default LinealGradientBtnBackground
