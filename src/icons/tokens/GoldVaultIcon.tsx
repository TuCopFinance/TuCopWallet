import * as React from 'react'
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Rect, Stop } from 'react-native-svg'

interface Props {
  size?: number
  testID?: string
}

const GoldVaultIcon = ({ size = 40, testID }: Props) => {
  const scale = size / 40
  const width = 44 * scale
  const height = 40 * scale

  return (
    <Svg width={width} height={height} viewBox="0 0 44 40" fill="none" testID={testID}>
      <Defs>
        <LinearGradient id="vaultBody" x1="4" y1="5" x2="40" y2="35" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#C9A227" />
          <Stop offset="0.5" stopColor="#B8860B" />
          <Stop offset="1" stopColor="#8B6914" />
        </LinearGradient>
        <LinearGradient
          id="vaultDial"
          x1="16"
          y1="10"
          x2="28"
          y2="26"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#FFE55C" />
          <Stop offset="0.5" stopColor="#FFD700" />
          <Stop offset="1" stopColor="#DAA520" />
        </LinearGradient>
        <LinearGradient id="goldBar" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <Stop offset="0" stopColor="#FFD700" />
          <Stop offset="1" stopColor="#B8860B" />
        </LinearGradient>
      </Defs>

      {/* Vault body */}
      <Rect
        x="4"
        y="5"
        width="36"
        height="30"
        rx="3"
        fill="url(#vaultBody)"
        stroke="#6B4F0A"
        strokeWidth="1.5"
      />

      {/* Door frame */}
      <Rect
        x="8"
        y="9"
        width="28"
        height="22"
        rx="2"
        fill="none"
        stroke="#8B6914"
        strokeWidth="1"
      />

      {/* Dial circle */}
      <Circle cx="22" cy="20" r="8" fill="url(#vaultDial)" stroke="#B8860B" strokeWidth="1" />
      <Circle cx="22" cy="20" r="6" fill="none" stroke="#8B6914" strokeWidth="0.75" />

      {/* Dial markers */}
      <G stroke="#8B6914" strokeWidth="1" strokeLinecap="round">
        <Line x1="22" y1="13" x2="22" y2="15" />
        <Line x1="22" y1="25" x2="22" y2="27" />
        <Line x1="15" y1="20" x2="17" y2="20" />
        <Line x1="27" y1="20" x2="29" y2="20" />
      </G>

      {/* Center knob */}
      <Circle cx="22" cy="20" r="2" fill="#FFD700" stroke="#B8860B" strokeWidth="0.5" />

      {/* Handle */}
      <Rect
        x="33"
        y="16"
        width="3"
        height="8"
        rx="1"
        fill="#DAA520"
        stroke="#8B6914"
        strokeWidth="0.5"
      />

      {/* Hinges */}
      <Rect x="5" y="11" width="2.5" height="4" rx="0.5" fill="#8B6914" />
      <Rect x="5" y="24" width="2.5" height="4" rx="0.5" fill="#8B6914" />

      {/* Gold bar peeking inside (subtle) */}
      <Ellipse cx="15" cy="27" rx="5" ry="1.5" fill="url(#goldBar)" opacity="0.5" />
    </Svg>
  )
}

export default React.memo(GoldVaultIcon)
