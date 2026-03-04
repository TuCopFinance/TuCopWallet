import * as React from 'react'
import Svg, { Circle, Defs, LinearGradient, Path, Stop, G } from 'react-native-svg'

interface Props {
  size?: number
  testID?: string
}

const EarnGrowIcon = ({ size = 40, testID }: Props) => {
  // The viewBox is 62x40 — two overlapping circles creating an infinity-like shape
  const scale = size / 40
  const width = 62 * scale
  const height = 40 * scale

  return (
    <Svg width={width} height={height} viewBox="0 0 62 40" fill="none" testID={testID}>
      <Defs>
        <LinearGradient
          id="copRingGrad"
          x1="20"
          y1="0"
          x2="20"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#FECA00" />
          <Stop offset="0.41" stopColor="#FECA00" />
          <Stop offset="1" stopColor="#FF0000" />
        </LinearGradient>
      </Defs>

      {/* COPm coin (left) */}
      <G>
        {/* Outer gradient ring */}
        <Circle cx="20" cy="20" r="19" stroke="url(#copRingGrad)" strokeWidth="2" fill="none" />
        {/* Purple fill */}
        <Circle cx="20" cy="20" r="17.5" fill="#510DC1" />
        {/* COP text */}
        <Path
          d="M12.24 24.5c-2.6 0-3.96-1.92-3.96-4.5s1.36-4.5 3.96-4.5c1.96 0 3.08 1.23 3.36 2.82h-1.52c-.2-.93-.73-1.57-1.84-1.57-1.67 0-2.33 1.33-2.33 3.25s.66 3.25 2.33 3.25c1.15 0 1.72-.74 1.88-1.73h1.52c-.21 1.75-1.54 2.98-3.4 2.98Z"
          fill="#E6E0FF"
        />
        <Path
          d="M19.76 24.5c-2.6 0-3.96-1.92-3.96-4.5s1.36-4.5 3.96-4.5 3.96 1.92 3.96 4.5-1.36 4.5-3.96 4.5Zm-2.33-4.5c0 1.92.66 3.25 2.33 3.25s2.33-1.33 2.33-3.25-.66-3.25-2.33-3.25-2.33 1.33-2.33 3.25Z"
          fill="#E6E0FF"
        />
        <Path
          d="M25.04 24.33V15.67h3.36c1.94 0 3.12 1.15 3.12 3.05 0 1.9-1.18 3.05-3.12 3.05h-1.88v2.56h-1.48Zm1.48-3.8h1.8c1.01 0 1.58-.55 1.58-1.81 0-1.26-.57-1.81-1.58-1.81h-1.8v3.62Z"
          fill="#E6E0FF"
        />
      </G>

      {/* Dollar coin (right, overlapping) */}
      <G>
        {/* Green circle */}
        <Circle cx="42" cy="20" r="19" fill="#22A34B" />
        {/* White border for depth/separation */}
        <Circle cx="42" cy="20" r="19" stroke="white" strokeWidth="1.5" fill="none" />
        {/* Dollar sign */}
        <Path
          d="M43.1 12.5v1.65c2.08.28 3.5 1.52 3.5 3.35h-2.1c0-1.02-.68-1.72-1.8-1.82v3.92l.6.16c2.2.58 3.5 1.62 3.5 3.64 0 2.1-1.58 3.3-3.7 3.54v1.56h-1.2v-1.56c-2.3-.26-3.8-1.62-3.8-3.7h2.1c0 1.18.78 1.92 2.1 2.04v-4.18l-.54-.14c-2.08-.56-3.46-1.5-3.46-3.56 0-1.98 1.52-3.18 3.6-3.42V12.5h1.2Zm-1.2 3.4c-1.08.16-1.7.82-1.7 1.72 0 .86.52 1.38 1.7 1.74v-3.46Zm1.2 8.92c1.16-.16 1.82-.84 1.82-1.82 0-.9-.56-1.44-1.82-1.82v3.64Z"
          fill="white"
        />
      </G>
    </Svg>
  )
}

export default React.memo(EarnGrowIcon)
