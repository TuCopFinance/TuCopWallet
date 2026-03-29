import * as React from 'react'
import Svg, { Path } from 'react-native-svg'
import colors from 'src/styles/colors'

interface Props {
  color?: string
  width?: number
  height?: number
}

const Lock = ({ color = colors.accent, width = 20, height = 20 }: Props) => (
  <Svg width={width} height={height} viewBox="0 0 24 27" fill="none">
    <Path
      d="M23.3139 5.58C19.06 4.15384 13.8731 1.44 12.7616 0.304617C12.5695 0.110771 12.3088 0 12.0343 0C11.7599 0 11.4991 0.110771 11.307 0.304617C8.21955 2.86616 4.61062 4.73538 0.754701 5.75999C0.315592 5.88461 0 6.3 0 6.75692C0 18.1523 1.7564 24.0923 11.7187 26.9585C11.8971 27.0138 12.1029 27.0138 12.2813 26.9585C22.3122 24.0646 24 18.3323 24 6.57692C24 6.13385 23.7118 5.73231 23.3002 5.59385L23.3139 5.58ZM12.0069 24.8677C3.75986 22.4031 2.12693 18.0831 2.05832 7.51846C5.66724 6.42462 9.04293 4.69384 12.0481 2.39538C15.1493 4.43076 18.47 6.06461 21.9554 7.29692C21.8868 18.0277 20.2539 22.3892 12.0069 24.8538V24.8677Z"
      fill={color}
    />
  </Svg>
)
export default Lock
