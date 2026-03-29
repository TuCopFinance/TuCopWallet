import * as React from 'react'
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg'

interface Props {
  size?: number
}

/**
 * Icono de Swap estilo Send/ArrowVertical
 * Ring + flechas swap con esquinas redondeadas (estilo chevron)
 */
const Swap = ({ size = 25 }: Props) => (
  <Svg width={size} height={size} viewBox="0 0 26 26" fill="none">
    <G clipPath="url(#clip0_swap)">
      {/* Ring + flechas en UN solo path (como Send) */}
      <Path
        d="M13 0.890625C6.10256 0.890625 0.5 6.31811 0.5 13C0.5 19.6819 6.10256 25.1094 13 25.1094C19.8974 25.1094 25.5 19.6819 25.5 13C25.5 6.31811 19.8974 0.903045 13 0.890625ZM13 23.2464C7.15385 23.2464 2.42308 18.6635 2.42308 13C2.42308 7.33654 7.15385 2.75361 13 2.75361C18.8462 2.75361 23.5769 7.33654 23.5769 13C23.5769 18.651 18.8333 23.234 13 23.2464ZM17.9 9.4C18.26 9.04 18.26 8.46 17.9 8.1L15.1 5.3C14.74 4.94 14.16 4.94 13.8 5.3C13.44 5.66 13.44 6.24 13.8 6.6L14.95 7.75H8.5C7.95 7.75 7.5 8.2 7.5 8.75C7.5 9.3 7.95 9.75 8.5 9.75H14.95L13.8 10.9C13.44 11.26 13.44 11.84 13.8 12.2C14.16 12.56 14.74 12.56 15.1 12.2L17.9 9.4ZM8.1 16.6C7.74 16.96 7.74 17.54 8.1 17.9L10.9 20.7C11.26 21.06 11.84 21.06 12.2 20.7C12.56 20.34 12.56 19.76 12.2 19.4L11.05 18.25H17.5C18.05 18.25 18.5 17.8 18.5 17.25C18.5 16.7 18.05 16.25 17.5 16.25H11.05L12.2 15.1C12.56 14.74 12.56 14.16 12.2 13.8C11.84 13.44 11.26 13.44 10.9 13.8L8.1 16.6Z"
        fill="#2F4ACD"
      />
    </G>
    <Defs>
      <ClipPath id="clip0_swap">
        <Rect width="25" height="24.2188" fill="white" transform="translate(0.5 0.890625)" />
      </ClipPath>
    </Defs>
  </Svg>
)
export default Swap
