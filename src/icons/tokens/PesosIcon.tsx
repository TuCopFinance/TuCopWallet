import * as React from 'react'
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from 'react-native-svg'

interface Props {
  size?: number
  testID?: string
}

/**
 * Ícono de Pesos Colombianos (COP$)
 * Moneda estilo peso colombiano con tono crema (#ede6b7)
 */
const PesosIcon = ({ size = 40, testID }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none" testID={testID}>
      <Defs>
        <LinearGradient id="pesosGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#F5EFC7" />
          <Stop offset="0.5" stopColor="#EDE6B7" />
          <Stop offset="1" stopColor="#D4C98A" />
        </LinearGradient>
      </Defs>
      <Circle cx="20" cy="20" r="19" fill="url(#pesosGrad)" />
      <Circle cx="20" cy="20" r="16" stroke="#C4B87A" strokeWidth="1.5" fill="none" />
      <Circle cx="20" cy="20" r="19" stroke="#B8A960" strokeWidth="1" fill="none" />
      {/* Símbolo $ */}
      <Path
        d="M21.1 10.5v1.65c2.08.28 3.5 1.52 3.5 3.35h-2.1c0-1.02-.68-1.72-1.8-1.82v3.92l.6.16c2.2.58 3.5 1.62 3.5 3.64 0 2.1-1.58 3.3-3.7 3.54v1.56h-1.2v-1.56c-2.3-.26-3.8-1.62-3.8-3.7h2.1c0 1.18.78 1.92 2.1 2.04v-4.18l-.54-.14c-2.08-.56-3.46-1.5-3.46-3.56 0-1.98 1.52-3.18 3.6-3.42V10.5h1.2Zm-1.2 3.4c-1.08.16-1.7.82-1.7 1.72 0 .86.52 1.38 1.7 1.74v-3.46Zm1.2 8.92c1.16-.16 1.82-.84 1.82-1.82 0-.9-.56-1.44-1.82-1.82v3.64Z"
        fill="#5D4A20"
      />
    </Svg>
  )
}

export default React.memo(PesosIcon)
