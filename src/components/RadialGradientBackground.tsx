import React from 'react'
import { StyleSheet } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'

const RadialGradientBackground = ({ style }: any) => (
  <Svg height="124" width="124" style={[StyleSheet.absoluteFill, style]}>
    <Defs>
      <RadialGradient
        id="grad"
        cx="100%"
        cy="0%"
        rx="68.31%"
        ry="68.31%"
        fx="100%"
        fy="0%"
        gradientUnits="userSpaceOnUse"
      >
        <Stop offset="0%" stopColor="#2F4ACD" stopOpacity="1" />
        <Stop offset="100%" stopColor="#0D0D0D" stopOpacity="1" />
      </RadialGradient>
    </Defs>
    <Rect x="0" y="0" width="124" height="124" fill="url(#grad)" />
  </Svg>
)

export default RadialGradientBackground
