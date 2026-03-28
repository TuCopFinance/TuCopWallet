import * as React from 'react'
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg'

interface Props {
  size?: number
  testID?: string
}

const GoldBarIcon = ({ size = 40, testID }: Props) => {
  const scale = size / 40
  const width = 48 * scale
  const height = 40 * scale

  return (
    <Svg width={width} height={height} viewBox="0 0 48 40" fill="none" testID={testID}>
      <Defs>
        <LinearGradient id="goldBar" x1="0" y1="12" x2="0" y2="36" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFE55C" />
          <Stop offset="0.4" stopColor="#FFD700" />
          <Stop offset="0.7" stopColor="#FFA500" />
          <Stop offset="1" stopColor="#B8860B" />
        </LinearGradient>
        <LinearGradient
          id="sparkleGrad"
          x1="0"
          y1="0"
          x2="0"
          y2="12"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#FFD700" />
        </LinearGradient>
      </Defs>

      {/* Main gold bar body */}
      <Path d="M6 16L2 34H46L42 16H6Z" fill="url(#goldBar)" stroke="#B8860B" strokeWidth="1.5" />

      {/* Top face (3D effect) */}
      <Path d="M6 16L12 12H38L42 16H6Z" fill="#FFE55C" stroke="#B8860B" strokeWidth="1" />

      {/* Embossed details on bar */}
      <Path d="M8 20H40" stroke="#DAA520" strokeWidth="0.75" strokeOpacity="0.6" />
      <Path d="M5 26H43" stroke="#DAA520" strokeWidth="0.75" strokeOpacity="0.6" />

      {/* Sparkle rays */}
      <Path d="M24 10L24 2" stroke="url(#sparkleGrad)" strokeWidth="2" strokeLinecap="round" />
      <Path d="M24 10L18 4" stroke="url(#sparkleGrad)" strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M24 10L30 4" stroke="url(#sparkleGrad)" strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M24 10L16 7" stroke="url(#sparkleGrad)" strokeWidth="1.25" strokeLinecap="round" />
      <Path d="M24 10L32 7" stroke="url(#sparkleGrad)" strokeWidth="1.25" strokeLinecap="round" />

      {/* Small sparkle dots */}
      <Circle cx="20" cy="3" r="1.25" fill="#FFFACD" />
      <Circle cx="28" cy="5" r="1" fill="#FFFACD" />
      <Circle cx="15" cy="6" r="1" fill="#FFFACD" />
    </Svg>
  )
}

export default React.memo(GoldBarIcon)
