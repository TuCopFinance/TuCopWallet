import * as React from 'react'
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
const Withdraw = () => (
  <Svg width="50" height="48" viewBox="0 0 50 48" fill="none">
    <Rect x="0.5" width="49" height="48" rx="24" fill="url(#paint0_radial_2105_1026)" />
    <Path
      d="M32.1795 13H17.8205C14.0585 13 11 16.0232 11 19.7419V28.2581C11 31.9768 14.0585 35 17.8205 35H32.1795C35.9415 35 39 31.9768 39 28.2581V19.7419C39 16.0232 35.9415 13 32.1795 13ZM17.8205 15.129H32.1795C34.7497 15.129 36.8462 17.2013 36.8462 19.7419V20.0968H13.1538V19.7419C13.1538 17.2013 15.2503 15.129 17.8205 15.129ZM32.1795 32.871H17.8205C15.2503 32.871 13.1538 30.7987 13.1538 28.2581V22.2258H36.8462V28.2581C36.8462 30.7987 34.7497 32.871 32.1795 32.871ZM23.2051 28.2581C23.2051 28.84 22.7169 29.3226 22.1282 29.3226H17.8205C17.2318 29.3226 16.7436 28.84 16.7436 28.2581C16.7436 27.6761 17.2318 27.1935 17.8205 27.1935H22.1282C22.7169 27.1935 23.2051 27.6761 23.2051 28.2581Z"
      fill="white"
    />
    <Defs>
      <RadialGradient
        id="paint0_radial_2105_1026"
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
  </Svg>
)
export default Withdraw
