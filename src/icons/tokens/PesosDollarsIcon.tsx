import * as React from 'react'
import Svg, { Circle, Path, Defs, LinearGradient, Stop, G } from 'react-native-svg'

interface Props {
  size?: number
  testID?: string
}

/**
 * Ícono de Pesos y Dólares superpuestos
 * Dólar (verde) atrás, Peso (crema) al frente
 * Para el botón "Agregar Pesos"
 */
const PesosDollarsIcon = ({ size = 40, testID }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none" testID={testID}>
      <Defs>
        <LinearGradient
          id="pesosGradOverlay"
          x1="0"
          y1="0"
          x2="28"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#F5EFC7" />
          <Stop offset="0.5" stopColor="#EDE6B7" />
          <Stop offset="1" stopColor="#D4C98A" />
        </LinearGradient>
      </Defs>

      {/* Dólar (atrás, arriba-izquierda) */}
      <G transform="translate(0, 0)">
        <Circle cx="14" cy="14" r="13" fill="#26A17B" />
        <Path
          d="M14.77 5.85v1.155c1.456.196 2.45 1.064 2.45 2.345h-1.47c0-.714-.476-1.204-1.26-1.274v2.744l.42.112c1.54.406 2.45 1.134 2.45 2.548 0 1.47-1.106 2.31-2.59 2.478v1.092h-.84v-1.092c-1.61-.182-2.66-1.134-2.66-2.59h1.47c0 .826.546 1.344 1.47 1.428v-2.926l-.378-.098c-1.456-.392-2.422-1.05-2.422-2.492 0-1.386 1.064-2.226 2.52-2.394V5.85h.84Zm-.84 2.38c-.756.112-1.19.574-1.19 1.204 0 .602.364.966 1.19 1.218V8.23Zm.84 6.244c.812-.112 1.274-.588 1.274-1.274 0-.63-.392-1.008-1.274-1.274v2.548Z"
          fill="white"
        />
      </G>

      {/* Peso (frente, abajo-derecha) */}
      <G transform="translate(12, 12)">
        <Circle cx="14" cy="14" r="13" fill="url(#pesosGradOverlay)" />
        <Circle cx="14" cy="14" r="11" stroke="#C4B87A" strokeWidth="1" fill="none" />
        <Circle cx="14" cy="14" r="13" stroke="#B8A960" strokeWidth="0.7" fill="none" />
        <Path
          d="M14.77 5.85v1.155c1.456.196 2.45 1.064 2.45 2.345h-1.47c0-.714-.476-1.204-1.26-1.274v2.744l.42.112c1.54.406 2.45 1.134 2.45 2.548 0 1.47-1.106 2.31-2.59 2.478v1.092h-.84v-1.092c-1.61-.182-2.66-1.134-2.66-2.59h1.47c0 .826.546 1.344 1.47 1.428v-2.926l-.378-.098c-1.456-.392-2.422-1.05-2.422-2.492 0-1.386 1.064-2.226 2.52-2.394V5.85h.84Zm-.84 2.38c-.756.112-1.19.574-1.19 1.204 0 .602.364.966 1.19 1.218V8.23Zm.84 6.244c.812-.112 1.274-.588 1.274-1.274 0-.63-.392-1.008-1.274-1.274v2.548Z"
          fill="#5D4A20"
        />
      </G>
    </Svg>
  )
}

export default React.memo(PesosDollarsIcon)
