import * as React from 'react'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'

interface Props {
  size?: number
  testID?: string
}

const GoldIcon = ({ size = 40, testID }: Props) => {
  const scale = size / 40
  const width = 48 * scale
  const height = 40 * scale

  return (
    <Svg width={width} height={height} viewBox="0 0 48 40" fill="none" testID={testID}>
      <Defs>
        <LinearGradient
          id="goldGradient"
          x1="0"
          y1="0"
          x2="0"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#FFD700" />
          <Stop offset="0.5" stopColor="#FFA500" />
          <Stop offset="1" stopColor="#B8860B" />
        </LinearGradient>
        <LinearGradient id="goldShine" x1="0" y1="0" x2="48" y2="40" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFFACD" stopOpacity="0.8" />
          <Stop offset="0.3" stopColor="#FFD700" stopOpacity="0" />
          <Stop offset="0.7" stopColor="#FFD700" stopOpacity="0" />
          <Stop offset="1" stopColor="#FFFACD" stopOpacity="0.4" />
        </LinearGradient>
      </Defs>

      {/* Bottom gold bar (background) */}
      <Path
        d="M6 28L10 36H38L42 28H6Z"
        fill="url(#goldGradient)"
        stroke="#B8860B"
        strokeWidth="1"
      />

      {/* Top gold bar (foreground, offset) */}
      <Path d="M2 16L6 24H34L38 16H2Z" fill="url(#goldGradient)" stroke="#B8860B" strokeWidth="1" />

      {/* Main gold bar (center) */}
      <Path d="M8 4L4 20H40L44 4H8Z" fill="url(#goldGradient)" stroke="#B8860B" strokeWidth="1.5" />

      {/* Shine effect on main bar */}
      <Path d="M10 6L7 18H18L21 6H10Z" fill="url(#goldShine)" />

      {/* Embossed lines on main bar */}
      <Path d="M12 8H36" stroke="#DAA520" strokeWidth="0.5" strokeOpacity="0.6" />
      <Path d="M10 12H38" stroke="#DAA520" strokeWidth="0.5" strokeOpacity="0.6" />
      <Path d="M8 16H40" stroke="#DAA520" strokeWidth="0.5" strokeOpacity="0.6" />
    </Svg>
  )
}

export default React.memo(GoldIcon)
