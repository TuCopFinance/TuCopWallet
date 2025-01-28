import * as React from 'react'
import Svg, { ClipPath, Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
const AddCCOP = () => (
  <Svg width="49" height="48" viewBox="0 0 49 48" fill="none">
    <Rect width="49" height="48" rx="24" fill="url(#paint0_radial_2105_980)" />
    <G clip-path="url(#clip0_2105_980)">
      <Path
        d="M29.9718 37.8855C18.9426 37.7755 13 30.4763 13 21.9108V10H19.0305C30.0596 10.0876 36.0023 17.3867 36.0023 25.9522V37.8855H29.9718ZM29.9718 32.3129V26.4776C29.9718 17.7145 23.5471 15.5726 19.0305 15.5726V21.4079C19.0305 30.1507 25.4777 32.3129 29.9718 32.3129Z"
        fill="white"
      />
      <Path d="M20.2987 38H13V32.3466C13 32.3466 14.8742 36.462 20.2987 38Z" fill="white" />
      <Path d="M28.4039 10.11H36V15.4177C36 15.4177 33.8262 11.648 28.4039 10.11Z" fill="white" />
    </G>
    <Defs>
      <RadialGradient
        id="paint0_radial_2105_980"
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
      <ClipPath id="clip0_2105_980">
        <Rect width="23" height="28" fill="white" transform="translate(13 10)" />
      </ClipPath>
    </Defs>
  </Svg>
)
export default AddCCOP
