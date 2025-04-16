import * as React from 'react'
import Svg, { Rect } from 'react-native-svg'
const Recharge = ({ size = 25 }) => (
  <Svg width={size} height={size} viewBox="0 0 25 25" fill="none">
    <Rect x="11" y="3" width="2" height="20" fill="#2F4ACD" />
    <Rect x="22" y="12" width="2" height="20" transform="rotate(90 22 12)" fill="#2F4ACD" />
  </Svg>
)
export default Recharge
