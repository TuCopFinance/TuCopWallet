import * as React from 'react'
import Svg, { Circle, Path } from 'react-native-svg'

interface Props {
  size?: number
  testID?: string
}

/**
 * Dollar icon for USDT/USD tokens
 * Green circle with white dollar sign (Tether-style)
 */
const DollarsIcon = ({ size = 40, testID }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none" testID={testID}>
      {/* Green circle background */}
      <Circle cx="20" cy="20" r="20" fill="#26A17B" />

      {/* Dollar sign */}
      <Path
        d="M21.1 10.5v1.65c2.08.28 3.5 1.52 3.5 3.35h-2.1c0-1.02-.68-1.72-1.8-1.82v3.92l.6.16c2.2.58 3.5 1.62 3.5 3.64 0 2.1-1.58 3.3-3.7 3.54v1.56h-1.2v-1.56c-2.3-.26-3.8-1.62-3.8-3.7h2.1c0 1.18.78 1.92 2.1 2.04v-4.18l-.54-.14c-2.08-.56-3.46-1.5-3.46-3.56 0-1.98 1.52-3.18 3.6-3.42V10.5h1.2Zm-1.2 3.4c-1.08.16-1.7.82-1.7 1.72 0 .86.52 1.38 1.7 1.74v-3.46Zm1.2 8.92c1.16-.16 1.82-.84 1.82-1.82 0-.9-.56-1.44-1.82-1.82v3.64Z"
        fill="white"
      />
    </Svg>
  )
}

export default React.memo(DollarsIcon)
