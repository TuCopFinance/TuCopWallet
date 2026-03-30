import * as React from 'react'
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg'

interface Props {
  size?: number
}

/**
 * Icono de Crecimiento estilo Send/Swap
 * Ring + gráfico de tendencia alcista con flecha
 */
const Grow = ({ size = 25 }: Props) => (
  <Svg width={size} height={size} viewBox="0 0 26 26" fill="none">
    <G clipPath="url(#clip0_grow)">
      {/* Ring exterior (igual que Send/Swap) */}
      <Path
        d="M13 0.890625C6.10256 0.890625 0.5 6.31811 0.5 13C0.5 19.6819 6.10256 25.1094 13 25.1094C19.8974 25.1094 25.5 19.6819 25.5 13C25.5 6.31811 19.8974 0.903045 13 0.890625ZM13 23.2464C7.15385 23.2464 2.42308 18.6635 2.42308 13C2.42308 7.33654 7.15385 2.75361 13 2.75361C18.8462 2.75361 23.5769 7.33654 23.5769 13C23.5769 18.651 18.8333 23.234 13 23.2464Z"
        fill="#2F4ACD"
      />
      {/* Línea de tendencia alcista (de abajo-izquierda a arriba-derecha) */}
      <Path
        d="M7.5 17.5L11 13L14.5 15L18.5 8.5"
        stroke="#2F4ACD"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Flecha hacia arriba en la punta */}
      <Path
        d="M15.5 8.5H18.5V11.5"
        stroke="#2F4ACD"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </G>
    <Defs>
      <ClipPath id="clip0_grow">
        <Rect width="25" height="24.2188" fill="white" transform="translate(0.5 0.890625)" />
      </ClipPath>
    </Defs>
  </Svg>
)

export default Grow
