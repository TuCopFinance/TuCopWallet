import * as React from 'react'
import { ColorValue } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import Colors from 'src/styles/colors'

export interface Props {
  height: number
  color: ColorValue
}

function BackChevron({ color, height }: Props) {
  return (
    <Svg width="15" height={height} viewBox="0 0 15 29" fill="none">
      <Path
        d="M14.6697 27.0803C15.098 27.5114 15.1122 28.2101 14.6982 28.656C14.2843 29.102 13.6134 29.1169 13.1852 28.6858C13.1852 28.6858 13.1709 28.6709 13.1567 28.656L0.31045 15.2775C-0.103483 14.8464 -0.103483 14.1329 0.31045 13.7018L13.1567 0.323314C13.5706 -0.107771 14.2558 -0.107771 14.6697 0.323314C15.0837 0.7544 15.0837 1.46792 14.6697 1.899L2.57999 14.4897L14.6697 27.0803Z"
        fill={color}
      />
    </Svg>
  )
}

BackChevron.defaultProps = {
  height: 16,
  color: Colors.black,
}

export default BackChevron
